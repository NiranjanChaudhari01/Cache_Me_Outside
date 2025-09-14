#!/usr/bin/env python3
"""
Test script to check if the auto-labeler now works correctly
"""
from auto_labeler import AutoLabeler

def test_auto_labeler():
    """Test the auto-labeler with sample text"""
    labeler = AutoLabeler()
    
    # Test text with known entities
    test_text = "Apple Inc. is located in Cupertino, California. John Smith works there."
    
    print(f"Testing text: {test_text}")
    print("=" * 50)
    
    # Test NER with different entity classes
    result = labeler.label_text(
        text=test_text,
        task_type="ner",
        language="en",
        entity_classes=['PER', 'LOC', 'ORG']
    )
    
    print("Auto-labeler result:")
    print(f"  Model used: {result['model_used']}")
    print(f"  Language: {result['language']}")
    print(f"  Entity count: {result['labels']['entity_count']}")
    print(f"  Entity types: {result['labels']['entity_types']}")
    print(f"  Selected classes: {result['labels']['selected_classes']}")
    
    print("\nEntities found:")
    for i, entity in enumerate(result['labels']['entities']):
        print(f"  {i+1}. Text: '{entity['text']}' | Class: {entity['class_name']} | Start: {entity['start_index']} | End: {entity['end_index']}")

if __name__ == "__main__":
    test_auto_labeler()
