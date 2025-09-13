from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from models import TaskStatus, FeedbackAction

# Project schemas
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    task_type: str  # "classification", "ner", "sentiment"

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    task_type: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Task schemas
class TaskResponse(BaseModel):
    id: int
    project_id: int
    text: str
    auto_labels: Optional[Dict[str, Any]]
    confidence_score: Optional[float]
    final_labels: Optional[Dict[str, Any]]
    status: TaskStatus
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Annotator schemas
class AnnotatorCreate(BaseModel):
    name: str
    email: str

class AnnotatorResponse(BaseModel):
    id: int
    name: str
    email: str
    tasks_completed: int
    accuracy_score: float
    avg_time_per_task: float
    
    class Config:
        from_attributes = True

# Client feedback schemas
class ClientFeedbackCreate(BaseModel):
    project_id: int
    task_id: int
    action: FeedbackAction
    comment: Optional[str] = None
    corrected_labels: Optional[Dict[str, Any]] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None

class ClientFeedbackResponse(BaseModel):
    id: int
    project_id: int
    task_id: int
    action: FeedbackAction
    comment: Optional[str]
    corrected_labels: Optional[Dict[str, Any]]
    client_name: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Guideline schemas
class GuidelineCreate(BaseModel):
    project_id: int
    title: str
    content: str

class GuidelineResponse(BaseModel):
    id: int
    project_id: int
    title: str
    content: str
    version: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Auto-labeling request
class AutoLabelRequest(BaseModel):
    task_type: str  # "classification", "ner", "sentiment"
    batch_size: Optional[int] = 100
    model_name: Optional[str] = None

# WebSocket message schemas
class WebSocketMessage(BaseModel):
    type: str
    data: Dict[str, Any]
    timestamp: datetime = datetime.utcnow()
