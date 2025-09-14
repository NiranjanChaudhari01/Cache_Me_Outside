import pika
import json
import os
from typing import List
from datetime import datetime
from schemas import AutoLabelTaskMessage
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RabbitMQPublisher:
    """Publisher service for sending auto-labeling tasks to RabbitMQ"""
    
    def __init__(self, rabbitmq_url: str = None):
        self.rabbitmq_url = rabbitmq_url or os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672/')
        self.connection = None
        self.channel = None
        self.queue_name = 'auto_labeling_queue'
        
    def connect(self):
        """Establish connection to RabbitMQ"""
        try:
            # Parse connection parameters
            parameters = pika.URLParameters(self.rabbitmq_url)
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            # Declare queue
            self.channel.queue_declare(queue=self.queue_name, durable=True)
            
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
    
    def publish_auto_labeling_task(self, task_message: AutoLabelTaskMessage) -> bool:
        """Publish a single auto-labeling task to the queue"""
        if not self.channel or self.channel.is_closed:
            if not self.connect():
                return False
        
        try:
            # Convert message to JSON
            message_body = task_message.json()
            
            # Publish message
            self.channel.basic_publish(
                exchange='',
                routing_key=self.queue_name,
                body=message_body,
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Make message persistent
                    timestamp=int(datetime.utcnow().timestamp())
                )
            )
            
            logger.info(f"Published auto-labeling task {task_message.task_id} to queue")
            return True
            
        except Exception as e:
            logger.error(f"Failed to publish task {task_message.task_id}: {e}")
            return False
    
    def publish_batch_auto_labeling_tasks(self, task_messages: List[AutoLabelTaskMessage]) -> int:
        """Publish multiple auto-labeling tasks to the queue"""
        if not self.channel or self.channel.is_closed:
            if not self.connect():
                return 0
        
        published_count = 0
        for task_message in task_messages:
            if self.publish_auto_labeling_task(task_message):
                published_count += 1
        
        logger.info(f"Published {published_count}/{len(task_messages)} tasks to queue")
        return published_count
    
    def get_queue_status(self) -> dict:
        """Get queue status information"""
        if not self.channel or self.channel.is_closed:
            if not self.connect():
                return {"error": "Failed to connect to RabbitMQ"}
        
        try:
            # Get queue info
            queue_info = self.channel.queue_declare(queue=self.queue_name, durable=True, passive=True)
            
            return {
                "auto_labeling_queue": {
                    "name": self.queue_name,
                    "message_count": queue_info.method.message_count,
                    "consumer_count": queue_info.method.consumer_count
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to get queue status: {e}")
            return {"error": str(e)}

# Example usage and message format
if __name__ == "__main__":
    # Example message that would be sent to RabbitMQ
    example_message = AutoLabelTaskMessage(
        task_id=123,
        project_id=1,
        text="Apple Inc. is located in Cupertino, California.",
        task_type="ner",
        language="en",
        entity_classes=["PER", "LOC", "ORG"],
        metadata={
            "source_file": "sample_data.csv",
            "row_index": 0,
            "confidence_threshold": 0.8
        }
    )
    
    print("Example RabbitMQ Message JSON:")
    print(json.dumps(example_message.dict(), indent=2, default=str))
    
    # Test publisher
    publisher = RabbitMQPublisher()
    if publisher.connect():
        print("\nQueue Status:")
        print(json.dumps(publisher.get_queue_status(), indent=2))
        publisher.disconnect()
