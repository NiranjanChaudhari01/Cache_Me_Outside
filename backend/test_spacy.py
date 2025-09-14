#!/usr/bin/env python3
"""
Test script to check what labels spaCy English model produces
"""
import spacy

def test_spacy_labels():
    """Test what entity labels spaCy produces"""
    try:
        nlp = spacy.load('en_core_web_sm')
        
        # Test text with known entities
        test_text = "Apple Inc. is located in Cupertino, California. John Smith works there."
        
        print(f"Testing text: {test_text}")
        print("=" * 50)
        
        doc = nlp(test_text)
        
        print("Entities found:")
        for ent in doc.ents:
            print(f"  Text: '{ent.text}' | Label: '{ent.label_}' | Start: {ent.start_char} | End: {ent.end_char}")
        
        print("\nAll available entity labels in the model:")
        labels = nlp.get_pipe("ner").labels
        for label in labels:
            print(f"  {label}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_spacy_labels()
