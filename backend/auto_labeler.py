import spacy
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
from typing import Dict, List, Any, Tuple
import numpy as np
import re
from datetime import datetime

class AutoLabeler:
    def __init__(self):
        """Initialize auto-labeling models"""
        self.models = {}
        self.load_models()
    
    def load_models(self):
        """Load pre-trained models for different tasks"""
        try:
            # Load spaCy model for NER
            self.nlp = spacy.load("en_core_web_sm")
            print("✅ Loaded spaCy model for NER")
        except OSError:
            print("⚠️  spaCy model not found. Install with: python -m spacy download en_core_web_sm")
            self.nlp = None
        
        try:
            # Load sentiment analysis model
            self.sentiment_pipeline = pipeline(
                "sentiment-analysis",
                model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                return_all_scores=True
            )
            print("✅ Loaded sentiment analysis model")
        except Exception as e:
            print(f"⚠️  Could not load sentiment model: {e}")
            self.sentiment_pipeline = None
        
        try:
            # Load text classification model (general purpose)
            self.classification_pipeline = pipeline(
                "text-classification",
                model="microsoft/DialoGPT-medium",
                return_all_scores=True
            )
            print("✅ Loaded text classification model")
        except Exception as e:
            print(f"⚠️  Could not load classification model: {e}")
            self.classification_pipeline = None
    
    def label_text(self, text: str, task_type: str) -> Dict[str, Any]:
        """
        Main method to auto-label text based on task type
        
        Args:
            text: Input text to label
            task_type: Type of labeling task ("ner", "sentiment", "classification")
        
        Returns:
            Dictionary with labels and confidence score
        """
        if task_type.lower() == "ner":
            return self.extract_entities(text)
        elif task_type.lower() == "sentiment":
            return self.analyze_sentiment(text)
        elif task_type.lower() == "classification":
            return self.classify_text(text)
        else:
            return self.fallback_labeling(text)
    
    def extract_entities(self, text: str) -> Dict[str, Any]:
        """Extract named entities using spaCy"""
        if not self.nlp:
            return self.fallback_ner(text)
        
        try:
            doc = self.nlp(text)
            entities = []
            confidence_scores = []
            
            for ent in doc.ents:
                entities.append({
                    "text": ent.text,
                    "label": ent.label_,
                    "start": ent.start_char,
                    "end": ent.end_char,
                    "description": spacy.explain(ent.label_)
                })
                # spaCy doesn't provide confidence scores, so we estimate based on entity type
                confidence_scores.append(self.estimate_ner_confidence(ent))
            
            # Calculate overall confidence
            avg_confidence = np.mean(confidence_scores) if confidence_scores else 0.5
            
            return {
                "labels": {
                    "entities": entities,
                    "entity_count": len(entities),
                    "entity_types": list(set([ent["label"] for ent in entities]))
                },
                "confidence": round(float(avg_confidence), 3),
                "model_used": "spacy_en_core_web_sm",
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            print(f"Error in NER: {e}")
            return self.fallback_ner(text)
    
    def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment using transformer model"""
        if not self.sentiment_pipeline:
            return self.fallback_sentiment(text)
        
        try:
            results = self.sentiment_pipeline(text)
            
            # Process results
            sentiment_scores = {}
            max_score = 0
            predicted_label = "NEUTRAL"
            
            for result in results[0]:  # results is a list with one element
                label = result['label']
                score = result['score']
                sentiment_scores[label] = round(score, 3)
                
                if score > max_score:
                    max_score = score
                    predicted_label = label
            
            return {
                "labels": {
                    "sentiment": predicted_label,
                    "scores": sentiment_scores,
                    "polarity": self.map_sentiment_to_polarity(predicted_label)
                },
                "confidence": round(max_score, 3),
                "model_used": "cardiffnlp/twitter-roberta-base-sentiment-latest",
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            print(f"Error in sentiment analysis: {e}")
            return self.fallback_sentiment(text)
    
    def classify_text(self, text: str, categories: List[str] = None) -> Dict[str, Any]:
        """Classify text into categories"""
        if not categories:
            categories = ["business", "technology", "sports", "entertainment", "politics", "other"]
        
        try:
            # Simple keyword-based classification for demo
            classification_result = self.keyword_based_classification(text, categories)
            
            return {
                "labels": {
                    "category": classification_result["category"],
                    "scores": classification_result["scores"],
                    "keywords_found": classification_result["keywords"]
                },
                "confidence": classification_result["confidence"],
                "model_used": "keyword_based_classifier",
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            print(f"Error in text classification: {e}")
            return self.fallback_classification(text)
    
    def keyword_based_classification(self, text: str, categories: List[str]) -> Dict[str, Any]:
        """Simple keyword-based classification"""
        text_lower = text.lower()
        
        # Define keywords for each category
        category_keywords = {
            "business": ["business", "company", "market", "finance", "economy", "profit", "revenue", "investment"],
            "technology": ["technology", "software", "AI", "machine learning", "computer", "digital", "tech", "innovation"],
            "sports": ["sports", "game", "team", "player", "match", "championship", "football", "basketball"],
            "entertainment": ["movie", "music", "celebrity", "entertainment", "film", "show", "actor", "artist"],
            "politics": ["politics", "government", "election", "president", "policy", "vote", "political", "congress"],
            "other": ["general", "news", "information", "update", "report"]
        }
        
        scores = {}
        keywords_found = {}
        
        for category in categories:
            if category in category_keywords:
                keywords = category_keywords[category]
                found_keywords = [kw for kw in keywords if kw in text_lower]
                score = len(found_keywords) / len(keywords)
                scores[category] = round(score, 3)
                keywords_found[category] = found_keywords
            else:
                scores[category] = 0.0
                keywords_found[category] = []
        
        # Find best category
        best_category = max(scores, key=scores.get)
        best_score = scores[best_category]
        
        # If no clear winner, default to "other"
        if best_score == 0:
            best_category = "other"
            best_score = 0.3
        
        return {
            "category": best_category,
            "scores": scores,
            "keywords": keywords_found[best_category],
            "confidence": min(best_score + 0.2, 1.0)  # Boost confidence slightly
        }
    
    def estimate_ner_confidence(self, entity) -> float:
        """Estimate confidence for NER entities based on type and length"""
        # Higher confidence for well-defined entity types
        high_confidence_types = ["PERSON", "ORG", "GPE", "DATE", "MONEY"]
        medium_confidence_types = ["PRODUCT", "EVENT", "FAC", "LAW"]
        
        base_confidence = 0.8 if entity.label_ in high_confidence_types else 0.6
        base_confidence = base_confidence if entity.label_ not in medium_confidence_types else 0.7
        
        # Adjust based on entity length (longer entities often more reliable)
        length_bonus = min(len(entity.text) / 20, 0.2)
        
        return min(base_confidence + length_bonus, 0.95)
    
    def map_sentiment_to_polarity(self, sentiment: str) -> str:
        """Map sentiment labels to simple polarity"""
        positive_labels = ["POSITIVE", "POS", "LABEL_2"]
        negative_labels = ["NEGATIVE", "NEG", "LABEL_0"]
        
        if sentiment in positive_labels:
            return "positive"
        elif sentiment in negative_labels:
            return "negative"
        else:
            return "neutral"
    
    # Fallback methods when models are not available
    def fallback_ner(self, text: str) -> Dict[str, Any]:
        """Fallback NER using regex patterns"""
        entities = []
        
        # Simple regex patterns for common entities
        patterns = {
            "EMAIL": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            "PHONE": r'\b\d{3}-\d{3}-\d{4}\b|\b\(\d{3}\)\s*\d{3}-\d{4}\b',
            "DATE": r'\b\d{1,2}/\d{1,2}/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b',
            "MONEY": r'\$\d+(?:,\d{3})*(?:\.\d{2})?'
        }
        
        for label, pattern in patterns.items():
            matches = re.finditer(pattern, text)
            for match in matches:
                entities.append({
                    "text": match.group(),
                    "label": label,
                    "start": match.start(),
                    "end": match.end(),
                    "description": f"Regex-detected {label}"
                })
        
        return {
            "labels": {
                "entities": entities,
                "entity_count": len(entities),
                "entity_types": list(set([ent["label"] for ent in entities]))
            },
            "confidence": 0.4,  # Lower confidence for regex-based
            "model_used": "regex_fallback",
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def fallback_sentiment(self, text: str) -> Dict[str, Any]:
        """Fallback sentiment analysis using keyword matching"""
        positive_words = ["good", "great", "excellent", "amazing", "wonderful", "fantastic", "love", "like", "happy"]
        negative_words = ["bad", "terrible", "awful", "hate", "dislike", "sad", "angry", "disappointed"]
        
        text_lower = text.lower()
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)
        
        if pos_count > neg_count:
            sentiment = "POSITIVE"
            confidence = min(0.6 + (pos_count * 0.1), 0.9)
        elif neg_count > pos_count:
            sentiment = "NEGATIVE"
            confidence = min(0.6 + (neg_count * 0.1), 0.9)
        else:
            sentiment = "NEUTRAL"
            confidence = 0.5
        
        return {
            "labels": {
                "sentiment": sentiment,
                "scores": {sentiment: confidence},
                "polarity": sentiment.lower()
            },
            "confidence": round(confidence, 3),
            "model_used": "keyword_fallback",
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def fallback_classification(self, text: str) -> Dict[str, Any]:
        """Fallback text classification"""
        return {
            "labels": {
                "category": "other",
                "scores": {"other": 0.5},
                "keywords_found": []
            },
            "confidence": 0.3,
            "model_used": "fallback_classifier",
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def fallback_labeling(self, text: str) -> Dict[str, Any]:
        """Generic fallback for unknown task types"""
        return {
            "labels": {
                "text_length": len(text),
                "word_count": len(text.split()),
                "has_punctuation": any(c in text for c in ".,!?;:"),
                "is_question": text.strip().endswith("?")
            },
            "confidence": 0.8,
            "model_used": "basic_text_analyzer",
            "timestamp": datetime.utcnow().isoformat()
        }
