#!/usr/bin/env python3
"""
Script to add sample tasks to the database and publish them to RabbitMQ queue
"""

import os
import sys
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import Base, Project, Task, TaskStatus
from schemas import AutoLabelTaskMessage
from rabbitmq_publisher import RabbitMQPublisher
from database import get_db

# Sample data for different task types
SAMPLE_CLASSIFICATION_TASKS = [
    {
        "text": "This product is absolutely amazing! I love it so much.",
        "task_type": "classification",
        "language": "en",
        "entity_classes": [],
        "metadata": {"source": "sample_reviews", "category": "positive"}
    },
    {
        "text": "Terrible quality, would not recommend to anyone.",
        "task_type": "classification", 
        "language": "en",
        "entity_classes": [],
        "metadata": {"source": "sample_reviews", "category": "negative"}
    },
    {
        "text": "The product is okay, nothing special but works fine.",
        "task_type": "classification",
        "language": "en", 
        "entity_classes": [],
        "metadata": {"source": "sample_reviews", "category": "neutral"}
    }
]

SAMPLE_NER_TASKS = [
    {
        "text": "Apple Inc. is located in Cupertino, California.",
        "task_type": "ner",
        "language": "en",
        "entity_classes": ["PER", "LOC", "ORG"],
        "metadata": {"source": "sample_ner", "domain": "technology"}
    },
    {
        "text": "John Smith works at Microsoft in Seattle, Washington.",
        "task_type": "ner", 
        "language": "en",
        "entity_classes": ["PER", "LOC", "ORG"],
        "metadata": {"source": "sample_ner", "domain": "technology"}
    },
    {
        "text": "The conference will be held in New York City at the Hilton Hotel.",
        "task_type": "ner",
        "language": "en",
        "entity_classes": ["PER", "LOC", "ORG"],
        "metadata": {"source": "sample_ner", "domain": "events"}
    }
]

SAMPLE_SENTIMENT_TASKS = [
    {
        "text": "I am so excited about this new feature!",
        "task_type": "sentiment",
        "language": "en",
        "entity_classes": [],
        "metadata": {"source": "sample_sentiment", "context": "product_feedback"}
    },
    {
        "text": "This is the worst experience I've ever had.",
        "task_type": "sentiment",
        "language": "en", 
        "entity_classes": [],
        "metadata": {"source": "sample_sentiment", "context": "customer_service"}
    },
    {
        "text": "The weather is nice today, nothing special though.",
        "task_type": "sentiment",
        "language": "en",
        "entity_classes": [],
        "metadata": {"source": "sample_sentiment", "context": "general"}
    }
]

def create_sample_project(db: Session, task_type: str) -> Project:
    """Create a sample project for the given task type"""
    project_name = f"Sample {task_type.title()} Project"
    
    # Check if project already exists
    existing_project = db.query(Project).filter(
        Project.name == project_name,
        Project.task_type == task_type
    ).first()
    
    if existing_project:
        print(f"Using existing project: {project_name} (ID: {existing_project.id})")
        return existing_project
    
    # Create new project
    if task_type == "ner":
        entity_classes = ["PER", "LOC", "ORG"]
    else:
        entity_classes = []
    
    project = Project(
        name=project_name,
        description=f"Sample project for {task_type} tasks",
        task_type=task_type,
        language="en",
        entity_classes=entity_classes
    )
    
    db.add(project)
    db.commit()
    db.refresh(project)
    
    print(f"Created new project: {project_name} (ID: {project.id})")
    return project

def add_sample_tasks(db: Session, project: Project, sample_tasks: list) -> list:
    """Add sample tasks to the database"""
    created_tasks = []
    
    for task_data in sample_tasks:
        task = Task(
            project_id=project.id,
            text=task_data["text"],
            task_metadata=task_data["metadata"],
            status=TaskStatus.UPLOADED  # Start as uploaded, will be set to processing when queued
        )
        
        db.add(task)
        created_tasks.append((task, task_data))
    
    db.commit()
    
    # Refresh to get the task IDs
    for task, _ in created_tasks:
        db.refresh(task)
    
    print(f"Added {len(created_tasks)} tasks to project {project.id}")
    return created_tasks

def publish_tasks_to_queue(created_tasks: list, project: Project) -> int:
    """Publish tasks to RabbitMQ queue for processing"""
    publisher = RabbitMQPublisher()
    
    if not publisher.connect():
        print("Failed to connect to RabbitMQ")
        return 0
    
    published_count = 0
    
    for task, task_data in created_tasks:
        # Create message for queue
        message = AutoLabelTaskMessage(
            task_id=task.id,
            project_id=project.id,
            text=task.text,
            task_type=task_data["task_type"],
            language=task_data["language"],
            entity_classes=task_data["entity_classes"],
            metadata=task_data["metadata"]
        )
        
        # Publish to queue
        if publisher.publish_auto_labeling_task(message):
            published_count += 1
            print(f"Published task {task.id} to queue")
        else:
            print(f"Failed to publish task {task.id}")
    
    publisher.disconnect()
    return published_count

def main():
    """Main function to add sample tasks and publish to queue"""
    print("🚀 Adding Sample Tasks to Database and Queue")
    print("=" * 50)
    
    # Initialize database
    db = next(get_db())
    
    try:
        all_created_tasks = []
        
        # Add classification tasks
        print("\n📝 Adding Classification Tasks...")
        classification_project = create_sample_project(db, "classification")
        classification_tasks = add_sample_tasks(db, classification_project, SAMPLE_CLASSIFICATION_TASKS)
        all_created_tasks.extend(classification_tasks)
        
        # Add NER tasks  
        print("\n🏷️ Adding NER Tasks...")
        ner_project = create_sample_project(db, "ner")
        ner_tasks = add_sample_tasks(db, ner_project, SAMPLE_NER_TASKS)
        all_created_tasks.extend(ner_tasks)
        
        # Add sentiment tasks
        print("\n😊 Adding Sentiment Tasks...")
        sentiment_project = create_sample_project(db, "sentiment")
        sentiment_tasks = add_sample_tasks(db, sentiment_project, SAMPLE_SENTIMENT_TASKS)
        all_created_tasks.extend(sentiment_tasks)
        
        print(f"\n✅ Total tasks created: {len(all_created_tasks)}")
        
        # Publish all tasks to queue
        print("\n📤 Publishing Tasks to Queue...")
        published_count = 0
        
        # Group tasks by project for publishing
        for project in [classification_project, ner_project, sentiment_project]:
            project_tasks = [(task, data) for task, data in all_created_tasks if task.project_id == project.id]
            if project_tasks:
                published_count += publish_tasks_to_queue(project_tasks, project)
        
        print(f"\n🎉 Successfully published {published_count}/{len(all_created_tasks)} tasks to queue")
        
        # Show queue status
        print("\n📊 Queue Status:")
        publisher = RabbitMQPublisher()
        if publisher.connect():
            status = publisher.get_queue_status()
            print(f"Messages in queue: {status['auto_labeling_queue']['message_count']}")
            print(f"Active consumers: {status['auto_labeling_queue']['consumer_count']}")
            publisher.disconnect()
        
        print(f"\n🔍 To check tasks in database:")
        print(f"   SELECT * FROM tasks WHERE status = 'uploaded' ORDER BY created_at DESC;")
        print(f"\n🚀 Ready to start consumer when you're ready!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()


