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
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # React frontend
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
            
            # Update task - ALL tasks go to annotator UI regardless of confidence
            task.auto_labels = result['labels']
            task.confidence_score = result['confidence']
            task.status = TaskStatus.IN_REVIEW  # Changed from AUTO_LABELED to IN_REVIEW
            
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
    
    return {"message": f"Auto-labeled {labeled_count} tasks - all sent to annotator UI"}

# Annotation endpoints
@app.get("/projects/{project_id}/tasks/pending", response_model=List[TaskResponse])
async def get_pending_tasks(
    project_id: int,
    annotator_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.IN_REVIEW  # Changed from AUTO_LABELED to IN_REVIEW
    )
    
    if annotator_id:
        # Return tasks that are either unassigned OR assigned to this annotator
        query = query.filter(
            (Task.annotator_id == None) | (Task.annotator_id == annotator_id)
        )
    
    # Still prioritize low confidence tasks first, but ALL tasks go to UI
    return query.order_by(Task.confidence_score.asc()).limit(50).all()

@app.put("/tasks/{task_id}/review")
async def review_task(
    task_id: int,
    request: dict,
    db: Session = Depends(get_db)
):
    final_labels = request.get("final_labels")
    annotator_id = request.get("annotator_id")
    
    if not final_labels:
        raise HTTPException(status_code=422, detail="final_labels is required")
    if annotator_id is None:
        raise HTTPException(status_code=422, detail="annotator_id is required")
    
    # Convert annotator_id to int if it's a string
    try:
        annotator_id = int(annotator_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="annotator_id must be a valid integer")
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check if labels were actually changed (for active learning)
    labels_changed = task.auto_labels != final_labels
    
    # Update task with human review
    task.final_labels = final_labels
    task.annotator_id = annotator_id
    task.status = TaskStatus.REVIEWED
    
    print(f"Updating task {task_id}: final_labels={final_labels}, annotator_id={annotator_id}")
    
    # Add to active learning if labels were changed
    if labels_changed and task.auto_labels and task.confidence_score:
        project = db.query(Project).filter(Project.id == task.project_id).first()
        if project:
            auto_labeler.add_correction(
                text=task.text,
                original_labels=task.auto_labels,
                corrected_labels=final_labels,
                confidence=task.confidence_score,
                task_type=project.task_type
            )
    
    try:
        db.commit()
        print(f"Successfully updated task {task_id}")
    except Exception as e:
        print(f"Database error: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    # Notify connected clients
    try:
        await manager.broadcast({
            "type": "task_reviewed",
            "project_id": task.project_id,
            "task_id": task_id,
            "annotator_id": annotator_id,
            "labels_changed": labels_changed
        })
    except Exception as e:
        print(f"WebSocket broadcast error: {e}")
        # Don't fail the request if WebSocket fails
    
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
    in_review = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.IN_REVIEW
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
        "in_review": in_review,  # Changed from auto_labeled to in_review
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

# Active learning endpoints
@app.get("/projects/{project_id}/training-stats")
async def get_training_stats(project_id: int):
    """Get active learning statistics"""
    stats = auto_labeler.get_training_stats()
    return {
        "project_id": project_id,
        "active_learning": stats,
        "message": f"Model will retrain after {stats['next_retrain_in']} more corrections"
    }

@app.post("/projects/{project_id}/force-retrain")
async def force_retrain(project_id: int):
    """Force immediate model retraining"""
    auto_labeler.retrain_model()
    return {"message": "Model learning adjustments applied"}

@app.get("/projects/{project_id}/learning-insights")
async def get_learning_insights(project_id: int, task_type: str = None):
    """Get learning insights for a specific task type"""
    if task_type:
        insights = auto_labeler.get_learning_insights(task_type)
        return {
            "project_id": project_id,
            "task_type": task_type,
            "insights": insights
        }
    else:
        # Get insights for all task types
        all_insights = {}
        for task_type in ["ner", "sentiment", "classification"]:
            all_insights[task_type] = auto_labeler.get_learning_insights(task_type)
        
        return {
            "project_id": project_id,
            "all_insights": all_insights
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
