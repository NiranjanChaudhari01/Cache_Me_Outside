#!/usr/bin/env python3
"""
Script to start the auto-labeler consumer for testing
"""
import os
import sys
from auto_labeler_consumer import AutoLabelerConsumer

def main():
    """Start the auto-labeler consumer"""
    print("Starting Auto-Labeler Consumer...")
    print("=" * 50)
    
    # Check environment variables
    rabbitmq_url = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672/')
    database_url = os.getenv('DATABASE_URL', 'postgresql://niranjanchaudhari@localhost:5432/auto_labeling')
    
    print(f"RabbitMQ URL: {rabbitmq_url}")
    print(f"Database URL: {database_url}")
    print()
    
    try:
        # Create and start consumer
        consumer = AutoLabelerConsumer(rabbitmq_url, database_url)
        print("Consumer initialized successfully")
        print("Waiting for messages...")
        print("Press Ctrl+C to stop")
        print("-" * 50)
        
        consumer.start_consuming()
        
    except KeyboardInterrupt:
        print("\nStopping consumer...")
        sys.exit(0)
    except Exception as e:
        print(f"Error starting consumer: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
