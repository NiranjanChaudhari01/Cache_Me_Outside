#!/usr/bin/env python3
"""
Script to inspect messages in the RabbitMQ queue
"""

import pika
import json
import os
from typing import List, Dict, Any

class QueueInspector:
    """Inspect messages in RabbitMQ queue without consuming them"""
    
    def __init__(self, rabbitmq_url: str = None):
        self.rabbitmq_url = rabbitmq_url or os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672/')
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
            
            print("Connected to RabbitMQ successfully")
            return True
            
        except Exception as e:
            print(f"Failed to connect to RabbitMQ: {e}")
            return False
    
    def disconnect(self):
        """Close RabbitMQ connection"""
        if self.connection and not self.connection.is_closed:
            self.connection.close()
            print("Disconnected from RabbitMQ")
    
    def get_queue_info(self) -> Dict[str, Any]:
        """Get queue information"""
        try:
            queue_info = self.channel.queue_declare(queue=self.queue_name, durable=True, passive=True)
            return {
                "name": self.queue_name,
                "message_count": queue_info.method.message_count,
                "consumer_count": queue_info.method.consumer_count
            }
        except Exception as e:
            print(f"Failed to get queue info: {e}")
            return {}
    
    def inspect_messages(self, max_messages: int = 10) -> List[Dict[str, Any]]:
        """Inspect messages in queue without consuming them"""
        messages = []
        
        try:
            # Get queue info first
            queue_info = self.get_queue_info()
            message_count = queue_info.get('message_count', 0)
            
            if message_count == 0:
                print("No messages in queue")
                return messages
            
            print(f"Found {message_count} messages in queue")
            
            # Set up a consumer that doesn't auto-acknowledge
            def on_message(channel, method, properties, body):
                try:
                    # Parse the message
                    message_data = json.loads(body)
                    messages.append({
                        "delivery_tag": method.delivery_tag,
                        "properties": {
                            "delivery_mode": properties.delivery_mode,
                            "timestamp": properties.timestamp,
                            "message_id": getattr(properties, 'message_id', None)
                        },
                        "content": message_data
                    })
                    
                    # Don't acknowledge - we're just inspecting
                    print(f"📨 Message {len(messages)}: Task ID {message_data.get('task_id')}")
                    
                except Exception as e:
                    print(f"Error parsing message: {e}")
                
                # Stop consuming after we've seen enough messages
                if len(messages) >= max_messages:
                    channel.stop_consuming()
            
            # Start consuming without auto-ack
            self.channel.basic_consume(
                queue=self.queue_name,
                on_message_callback=on_message,
                auto_ack=False
            )
            
            # Consume messages (will stop when we reach max_messages)
            print("Inspecting messages...")
            self.channel.start_consuming()
            
        except Exception as e:
            print(f"Error inspecting messages: {e}")
        
        return messages
    
    def print_message_details(self, messages: List[Dict[str, Any]]):
        """Print detailed information about messages"""
        print(f"\n{'='*60}")
        print(f"📋 QUEUE MESSAGE INSPECTION REPORT")
        print(f"{'='*60}")
        
        for i, msg in enumerate(messages, 1):
            print(f"\n📨 MESSAGE #{i}")
            print(f"   Delivery Tag: {msg['delivery_tag']}")
            print(f"   Timestamp: {msg['properties']['timestamp']}")
            print(f"   Delivery Mode: {msg['properties']['delivery_mode']}")
            
            content = msg['content']
            print(f"   Task ID: {content.get('task_id')}")
            print(f"   Project ID: {content.get('project_id')}")
            print(f"   Task Type: {content.get('task_type')}")
            print(f"   Language: {content.get('language')}")
            print(f"   Text: {content.get('text', '')[:100]}...")
            print(f"   Entity Classes: {content.get('entity_classes')}")
            print(f"   Metadata: {content.get('metadata')}")
            print(f"   Created At: {content.get('created_at')}")

def main():
    """Main function to inspect queue messages"""
    inspector = QueueInspector()
    
    if not inspector.connect():
        return
    
    try:
        # Get queue info
        queue_info = inspector.get_queue_info()
        print("Queue Information:")
        print(json.dumps(queue_info, indent=2))
        
        # Inspect messages
        messages = inspector.inspect_messages(max_messages=10)
        
        if messages:
            inspector.print_message_details(messages)
        else:
            print("\nNo messages found in queue")
            
    finally:
        inspector.disconnect()

if __name__ == "__main__":
    main()


