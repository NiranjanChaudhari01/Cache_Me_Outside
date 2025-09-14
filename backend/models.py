from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, JSON, ForeignKey, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()

class TaskStatus(enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    AUTO_LABELED = "auto_labeled"
    IN_REVIEW = "in_review"
    REVIEWED = "reviewed"
    CLIENT_APPROVED = "client_approved"
    CLIENT_REJECTED = "client_rejected"
    COMPLETED = "completed"

class FeedbackAction(enum.Enum):
    APPROVE = "approve"
    REJECT = "reject"
    CORRECT = "correct"

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    task_type = Column(String, nullable=False)  # "classification", "ner", "sentiment"
    language = Column(String, default='en')  # Language code (e.g., 'en', 'es', 'fr')
    entity_classes = Column(JSON, default=list)  # List of entity classes to annotate (e.g., ['PER', 'LOC', 'ORG'])
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    tasks = relationship("Task", back_populates="project")
    guidelines = relationship("Guideline", back_populates="project")
    client_feedback = relationship("ClientFeedback", back_populates="project")

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    text = Column(Text, nullable=False)
    
    # Auto-labeling results
    auto_labels = Column(JSON)  # {"labels": [...], "entities": [...]}
    confidence_score = Column(Float)
    
    # Additional metadata (for Amazon dataset)
    task_metadata = Column(JSON)  # {"product_title": "...", "product_category": "...", "star_rating": 5}
    
    # Human review results
    final_labels = Column(JSON)
    annotator_id = Column(Integer, ForeignKey("annotators.id"))
    
    # Status tracking
    status = Column(Enum(TaskStatus), default=TaskStatus.UPLOADED)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="tasks")
    annotator = relationship("Annotator", back_populates="tasks")
    client_feedback = relationship("ClientFeedback", back_populates="task")

class Annotator(Base):
    __tablename__ = "annotators"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    
    # Performance metrics
    tasks_completed = Column(Integer, default=0)
    accuracy_score = Column(Float, default=0.0)
    avg_time_per_task = Column(Float, default=0.0)  # in seconds
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    tasks = relationship("Task", back_populates="annotator")

class ClientFeedback(Base):
    __tablename__ = "client_feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    
    action = Column(Enum(FeedbackAction), nullable=False)
    comment = Column(Text)
    corrected_labels = Column(JSON)  # If action is "correct"
    
    # Client info
    client_name = Column(String)
    client_email = Column(String)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="client_feedback")
    task = relationship("Task", back_populates="client_feedback")

class Guideline(Base):
    __tablename__ = "guidelines"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    project = relationship("Project", back_populates="guidelines")

class ModelMetrics(Base):
    __tablename__ = "model_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    
    model_name = Column(String, nullable=False)
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    
    # Training data info
    training_samples = Column(Integer)
    validation_samples = Column(Integer)
    
    created_at = Column(DateTime, default=datetime.utcnow)
