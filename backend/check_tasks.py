#!/usr/bin/env python3
"""
Script to check tasks in the database
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models import Task, TaskStatus

def check_tasks():
    """Check tasks in the database"""
    database_url = os.getenv('DATABASE_URL', 'postgresql://niranjanchaudhari@localhost:5432/auto_labeling')
    
    print(f"Connecting to database: {database_url}")
    
    try:
        # Create engine
        engine = create_engine(database_url)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        with SessionLocal() as session:
            # Get all tasks for project 36
            tasks = session.query(Task).filter(Task.project_id == 36).all()
            
            print(f"Found {len(tasks)} tasks for project 36:")
            
            for task in tasks:
                print(f"  Task {task.id}: status={task.status}, text='{task.text[:50]}...'")
            
            # Count by status
            status_counts = {}
            for task in tasks:
                status = task.status.value if task.status else 'None'
                status_counts[status] = status_counts.get(status, 0) + 1
            
            print(f"\nStatus counts: {status_counts}")
            
    except Exception as e:
        print(f"❌ Error checking tasks: {e}")
        sys.exit(1)

if __name__ == "__main__":
    check_tasks()
