from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import pandas as pd
from io import StringIO

from database import get_db, init_db
from models import Project, Task, Annotator, ClientFeedback, Guideline, TaskStatus, FeedbackAction
from schemas import (
    ProjectCreate, ProjectResponse, TaskResponse, AnnotatorCreate, 
    ClientFeedbackCreate, GuidelineCreate, AutoLabelRequest
)
from auto_labeler import AutoLabeler
from websocket_manager import ConnectionManager

# Initialize FastAPI app
app = FastAPI(
    title="Smart Auto-Labeling API",
    description="Hybrid NLP annotation pipeline with real-time client feedback",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize components
auto_labeler = AutoLabeler()
manager = ConnectionManager()

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    init_db()

# WebSocket endpoint for real-time updates
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages if needed
    except WebSocketDisconnect:
        manager.disconnect(client_id)

# Project endpoints
@app.post("/projects/", response_model=ProjectResponse)
async def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = Project(**project.dict())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@app.get("/projects/", response_model=List[ProjectResponse])
async def get_projects(db: Session = Depends(get_db)):
    return db.query(Project).all()

@app.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

# Data upload endpoint
@app.post("/projects/{project_id}/upload")
async def upload_dataset(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Read uploaded file
    content = await file.read()
    
    try:
        # Parse CSV/JSON data
        if file.filename.endswith('.csv'):
            df = pd.read_csv(StringIO(content.decode('utf-8')))
            texts = df['text'].tolist() if 'text' in df.columns else df.iloc[:, 0].tolist()
        elif file.filename.endswith('.json'):
            data = json.loads(content.decode('utf-8'))
            texts = [item['text'] for item in data] if isinstance(data, list) else [data['text']]
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
        
        # Create tasks
        tasks_created = 0
        for text in texts:
            if text and len(text.strip()) > 0:
                task = Task(
                    project_id=project_id,
                    text=text.strip(),
                    status=TaskStatus.UPLOADED
                )
                db.add(task)
                tasks_created += 1
        
        db.commit()
        
        # Notify connected clients
        await manager.broadcast({
            "type": "dataset_uploaded",
            "project_id": project_id,
            "tasks_count": tasks_created
        })
        
        return {"message": f"Successfully uploaded {tasks_created} tasks"}
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")

# Auto-labeling endpoint
@app.post("/projects/{project_id}/auto-label")
async def auto_label_tasks(
    project_id: int,
    request: AutoLabelRequest,
    db: Session = Depends(get_db)
):
    # Get pending tasks
    tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.UPLOADED
    ).limit(request.batch_size or 100).all()
    
    if not tasks:
        raise HTTPException(status_code=404, detail="No tasks available for auto-labeling")
    
    labeled_count = 0
    for task in tasks:
        try:
            # Run auto-labeling
            result = auto_labeler.label_text(task.text, request.task_type)
            
            # Update task
            task.auto_labels = result['labels']
            task.confidence_score = result['confidence']
            task.status = TaskStatus.AUTO_LABELED
            
            labeled_count += 1
            
        except Exception as e:
            print(f"Error auto-labeling task {task.id}: {str(e)}")
            continue
    
    db.commit()
    
    # Notify connected clients
    await manager.broadcast({
        "type": "auto_labeling_completed",
        "project_id": project_id,
        "labeled_count": labeled_count
    })
    
    return {"message": f"Auto-labeled {labeled_count} tasks"}

# Annotation endpoints
@app.get("/projects/{project_id}/tasks/pending", response_model=List[TaskResponse])
async def get_pending_tasks(
    project_id: int,
    annotator_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.AUTO_LABELED
    )
    
    if annotator_id:
        query = query.filter(Task.annotator_id == annotator_id)
    
    return query.order_by(Task.confidence_score.asc()).limit(50).all()

@app.put("/tasks/{task_id}/review")
async def review_task(
    task_id: int,
    final_labels: dict,
    annotator_id: int,
    db: Session = Depends(get_db)
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update task with human review
    task.final_labels = final_labels
    task.annotator_id = annotator_id
    task.status = TaskStatus.REVIEWED
    
    db.commit()
    
    # Notify connected clients
    await manager.broadcast({
        "type": "task_reviewed",
        "project_id": task.project_id,
        "task_id": task_id,
        "annotator_id": annotator_id
    })
    
    return {"message": "Task reviewed successfully"}

# Client feedback endpoints
@app.get("/projects/{project_id}/sample-tasks")
async def get_sample_tasks(
    project_id: int,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get sample tasks for client review"""
    tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.REVIEWED
    ).order_by(Task.updated_at.desc()).limit(limit).all()
    
    return tasks

@app.post("/feedback/")
async def submit_client_feedback(
    feedback: ClientFeedbackCreate,
    db: Session = Depends(get_db)
):
    # Create feedback record
    db_feedback = ClientFeedback(**feedback.dict())
    db.add(db_feedback)
    
    # Update task status based on feedback
    task = db.query(Task).filter(Task.id == feedback.task_id).first()
    if task:
        if feedback.action == FeedbackAction.APPROVE:
            task.status = TaskStatus.CLIENT_APPROVED
        elif feedback.action == FeedbackAction.REJECT:
            task.status = TaskStatus.CLIENT_REJECTED
    
    db.commit()
    
    # Notify connected clients
    await manager.broadcast({
        "type": "client_feedback_received",
        "project_id": feedback.project_id,
        "task_id": feedback.task_id,
        "action": feedback.action.value
    })
    
    return {"message": "Feedback submitted successfully"}

# Analytics endpoints
@app.get("/projects/{project_id}/stats")
async def get_project_stats(project_id: int, db: Session = Depends(get_db)):
    """Get project statistics for dashboard"""
    total_tasks = db.query(Task).filter(Task.project_id == project_id).count()
    auto_labeled = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.AUTO_LABELED
    ).count()
    reviewed = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.REVIEWED
    ).count()
    approved = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.CLIENT_APPROVED
    ).count()
    
    # Calculate average confidence
    avg_confidence = db.query(Task).filter(
        Task.project_id == project_id,
        Task.confidence_score.isnot(None)
    ).with_entities(Task.confidence_score).all()
    
    avg_conf = sum([c[0] for c in avg_confidence]) / len(avg_confidence) if avg_confidence else 0
    
    return {
        "total_tasks": total_tasks,
        "auto_labeled": auto_labeled,
        "reviewed": reviewed,
        "approved": approved,
        "completion_rate": (approved / total_tasks * 100) if total_tasks > 0 else 0,
        "average_confidence": round(avg_conf, 2)
    }

# Export endpoint
@app.get("/projects/{project_id}/export")
async def export_labeled_data(project_id: int, db: Session = Depends(get_db)):
    """Export final labeled dataset"""
    tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status.in_([TaskStatus.CLIENT_APPROVED, TaskStatus.REVIEWED])
    ).all()
    
    export_data = []
    for task in tasks:
        export_data.append({
            "id": task.id,
            "text": task.text,
            "auto_labels": task.auto_labels,
            "final_labels": task.final_labels,
            "confidence_score": task.confidence_score,
            "status": task.status.value
        })
    
    return {"data": export_data, "count": len(export_data)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
