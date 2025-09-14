import pika
import json
import os
import time
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auto_labeler import AutoLabeler
from schemas import AutoLabelTaskMessage, AutoLabelResultMessage
from models import Task, TaskStatus
from database import get_db
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AutoLabelerConsumer:
    """Consumer service for processing auto-labeling tasks from RabbitMQ"""
    
    def __init__(self, rabbitmq_url: str = None, database_url: str = None):
        self.rabbitmq_url = rabbitmq_url or os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672/')
        self.database_url = database_url or os.getenv('DATABASE_URL', 'postgresql://niranjanchaudhari@localhost:5432/auto_labeling')
        
        # Initialize auto-labeler
        self.auto_labeler = AutoLabeler()
        
        # Initialize database connection
        self.engine = create_engine(self.database_url)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        
        # RabbitMQ connection
        self.connection = None
        self.channel = None
        self.queue_name = 'auto_labeling_queue'
        
    def connect(self):
        """Establish connection to RabbitMQ"""
        try:
            parameters = pika.URLParameters(self.rabbitmq_url)
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # Declare queue
            self.channel.queue_declare(queue=self.queue_name, durable=True)
            
            # Set QoS to process one message at a time
            self.channel.basic_qos(prefetch_count=1)
            
            logger.info("Connected to RabbitMQ successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            return False
    
    def disconnect(self):
        """Close RabbitMQ connection"""
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            logger.info("Disconnected from RabbitMQ")
    
    def process_task(self, task_message: AutoLabelTaskMessage) -> AutoLabelResultMessage:
        """Process a single auto-labeling task"""
        start_time = time.time()
        
        try:
            logger.info(f"Processing task {task_message.task_id} for project {task_message.project_id}")
            logger.info(f"Text: {task_message.text[:100]}...")
            logger.info(f"Task type: {task_message.task_type}, Language: {task_message.language}")
            logger.info(f"Entity classes: {task_message.entity_classes}")
            
            # Run auto-labeling
            result = self.auto_labeler.label_text(
                text=task_message.text,
                task_type=task_message.task_type,
                language=task_message.language,
                metadata_hints=task_message.metadata or {},
                entity_classes=task_message.entity_classes
            )
            
            processing_time = time.time() - start_time
            
            logger.info(f"Auto-labeling result for task {task_message.task_id}: {result}")
            
            # Create success result - use the full result structure
            return AutoLabelResultMessage(
                task_id=task_message.task_id,
                project_id=task_message.project_id,
                success=True,
                auto_labels=result,  # Store the full result structure
                model_used=result.get('model_used'),
                processing_time=processing_time
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Error processing task {task_message.task_id}: {e}", exc_info=True)
            
            # Create error result
            return AutoLabelResultMessage(
                task_id=task_message.task_id,
                project_id=task_message.project_id,
                success=False,
                error_message=str(e),
                processing_time=processing_time
            )
    
    def mark_task_as_processing(self, task_id: int):
        """Mark task as PROCESSING when consumer starts working on it"""
        db = self.SessionLocal()
        try:
            task = db.query(Task).filter(Task.id == task_id).first()
            if not task:
                logger.error(f"Task {task_id} not found in database")
                return False
            
            task.status = TaskStatus.PROCESSING
            db.commit()
            logger.info(f"Marked task {task_id} as PROCESSING")
            return True
            
        except Exception as e:
            logger.error(f"Database error marking task {task_id} as PROCESSING: {e}")
            db.rollback()
            return False
        finally:
            db.close()
    
    def update_task_in_database(self, result: AutoLabelResultMessage):
        """Update task in database with auto-labeling results"""
        db = self.SessionLocal()
        try:
            task = db.query(Task).filter(Task.id == result.task_id).first()
            if not task:
                logger.error(f"Task {result.task_id} not found in database")
                return False
            
            if result.success:
                # Update task with successful auto-labeling results
                task.auto_labels = result.auto_labels
                task.status = TaskStatus.IN_REVIEW  # Ready for annotator review
                task.confidence_score = self._calculate_confidence_score(result.auto_labels)
                
                logger.info(f"Updated task {result.task_id} with auto-labels: {result.auto_labels}")
                logger.info(f"Task status changed to: {task.status}")
            else:
                # Mark task as failed
                task.status = TaskStatus.UPLOADED  # Keep as uploaded for retry
                logger.warning(f"Task {result.task_id} auto-labeling failed: {result.error_message}")
            
            db.commit()
            logger.info(f"Successfully committed task {result.task_id} to database")
            return True
            
        except Exception as e:
            logger.error(f"Database error updating task {result.task_id}: {e}", exc_info=True)
            db.rollback()
            return False
        finally:
            db.close()
    
    def _calculate_confidence_score(self, auto_labels: Dict[str, Any]) -> float:
        """Calculate confidence score based on auto-labeling results"""
        if not auto_labels:
            return 0.0
        
        # Handle the nested structure from auto_labeler
        labels = auto_labels.get('labels', {})
        entities = labels.get('entities', [])
        
        if not entities:
            return 0.0
        
        # Simple confidence calculation based on entity count and types
        # More entities generally indicate higher confidence
        entity_count = len(entities)
        unique_types = len(set(entity.get('class_name', '') for entity in entities))
        
        # Normalize to 0-1 range
        confidence = min(1.0, (entity_count * 0.1) + (unique_types * 0.2))
        return round(confidence, 2)
    
    def publish_result(self, result: AutoLabelResultMessage):
        """Publish result back to results queue (optional - for monitoring)"""
        # Results are now only stored in database, no need to publish to queue
        logger.info(f"Processed task {result.task_id} - result stored in database")
    
    def on_message_received(self, channel, method, properties, body):
        """Callback function for processing received messages"""
        try:
            # Parse message
            logger.info(f"Received message: {body.decode('utf-8')[:200]}...")
            message_data = json.loads(body)
            task_message = AutoLabelTaskMessage(**message_data)
            
            logger.info(f"Received task {task_message.task_id} for processing")
            
            # First, mark task as PROCESSING
            if not self.mark_task_as_processing(task_message.task_id):
                logger.error(f"Failed to mark task {task_message.task_id} as processing")
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return
            
            # Process the task
            result = self.process_task(task_message)
            
            # Update database with results
            if not self.update_task_in_database(result):
                logger.error(f"Failed to update task {task_message.task_id} in database")
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return
            
            # Publish result (optional - for monitoring/analytics)
            self.publish_result(result)
            
            # Acknowledge message
            channel.basic_ack(delivery_tag=method.delivery_tag)
            
            logger.info(f"Completed processing task {task_message.task_id}")
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {e}")
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            # Reject message and don't requeue
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    
    def start_consuming(self):
        """Start consuming messages from the queue"""
        if not self.connect():
            logger.error("Failed to connect to RabbitMQ")
            return
        
        try:
            # Set up consumer
            self.channel.basic_consume(
                queue=self.queue_name,
                on_message_callback=self.on_message_received
            )
            
            logger.info(f"Started consuming from queue: {self.queue_name}")
            logger.info("Waiting for messages. Press CTRL+C to exit.")
            
            # Start consuming
            self.channel.start_consuming()
            
        except KeyboardInterrupt:
            logger.info("Stopping consumer...")
            self.channel.stop_consuming()
        except Exception as e:
            logger.error(f"Error in consumer: {e}")
        finally:
            self.disconnect()

def main():
    """Main function to start the consumer"""
    consumer = AutoLabelerConsumer()
    consumer.start_consuming()

if __name__ == "__main__":
    main()
