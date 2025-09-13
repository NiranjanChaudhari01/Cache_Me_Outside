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
        self.training_data = []  # Store corrections for learning
        self.retrain_threshold = 50  # Simulate retrain after 50 corrections
        self.confidence_adjustments = {}  # Store confidence adjustments
        self.error_patterns = {}  # Store common error patterns
        self.learning_enabled = True  # Enable/disable learning
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
    
    def label_text(self, text: str, task_type: str, metadata_hints: Dict = None) -> Dict[str, Any]:
        """
        Main method to auto-label text based on task type
        
        Args:
            text: Input text to label
            task_type: Type of labeling task ("ner", "sentiment", "classification")
            metadata_hints: Optional metadata hints (e.g., suggested_category from product_category)
        
        Returns:
            Dictionary with labels and confidence score
        """
        # Get base prediction
        if task_type.lower() == "ner":
            result = self.extract_entities(text)
        elif task_type.lower() == "sentiment":
            result = self.analyze_sentiment(text)
        elif task_type.lower() == "classification":
            result = self.classify_text(text, metadata_hints)
        else:
            result = self.fallback_labeling(text)
        
        # Apply learning-based confidence adjustment
        if "confidence" in result:
            original_confidence = result["confidence"]
            adjusted_confidence = self.apply_confidence_adjustment(task_type, original_confidence)
            result["confidence"] = round(adjusted_confidence, 3)
            
            # Add learning indicator
            if original_confidence != adjusted_confidence:
                result["confidence_adjusted"] = True
                result["original_confidence"] = original_confidence
                result["adjustment_factor"] = round(adjusted_confidence / original_confidence, 2)
        
        return result
    
    def extract_entities(self, text: str) -> Dict[str, Any]:
        """Extract named entities using spaCy - focused on PERSON and LOCATION"""
        if not self.nlp:
            # Return empty result if spaCy is not available
            return {
                "labels": {
                    "entities": [],
                    "entity_count": 0,
                    "entity_types": []
                },
                "confidence": 0.0,
                "model_used": "spacy_unavailable",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        try:
            doc = self.nlp(text)
            entities = []
            confidence_scores = []
            
            # Filter for only PERSON and LOCATION entities
            target_labels = ['PERSON', 'GPE', 'LOC', 'EVENT', 'ORG']  # GPE = Geopolitical entity, LOC = Location, EVENT = Historical events, ORG = Organizations/Names
            
            for ent in doc.ents:
                # Map spaCy labels to our target labels
                if ent.label_ in ['PERSON']:
                    class_name = 'PER'
                elif ent.label_ in ['GPE', 'LOC', 'EVENT']:
                    class_name = 'LOC'
                elif ent.label_ in ['ORG']:
                    class_name = 'PER'  # Organizations/names like "Napoleon" are treated as persons
                else:
                    continue  # Skip other entity types
                
                entities.append({
                    "class_name": class_name,
                    "start_index": ent.start_char,
                    "end_index": ent.end_char,
                    "text": ent.text,
                    "original_label": ent.label_
                })
                # spaCy doesn't provide confidence scores, so we estimate based on entity type
                confidence_scores.append(self.estimate_ner_confidence(ent))
            
            # Calculate overall confidence
            avg_confidence = np.mean(confidence_scores) if confidence_scores else 0.5
            
            return {
                "labels": {
                    "entities": entities,
                    "entity_count": len(entities),
                    "entity_types": list(set([ent["class_name"] for ent in entities]))
                },
                "confidence": round(float(avg_confidence), 3),
                "model_used": "spacy_en_core_web_sm",
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            print(f"Error in NER: {e}")
            # Return empty result on error
            return {
                "labels": {
                    "entities": [],
                    "entity_count": 0,
                    "entity_types": []
                },
                "confidence": 0.0,
                "model_used": "spacy_error",
                "timestamp": datetime.utcnow().isoformat()
            }
    
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
    
    def classify_text(self, text: str, metadata_hints: Dict = None, categories: List[str] = None) -> Dict[str, Any]:
        """Classify text into categories"""
        if not categories:
            categories = ["electronics", "beauty", "home", "clothing", "books", "automotive", "other"]
        
        try:
            # Simple keyword-based classification for demo
            classification_result = self.keyword_based_classification(text, categories, metadata_hints)
            
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
    
    def keyword_based_classification(self, text: str, categories: List[str], metadata_hints: Dict = None) -> Dict[str, Any]:
        """Simple keyword-based classification with metadata hints"""
        text_lower = text.lower()
        
        # Define keywords for Amazon product categories
        category_keywords = {
            "electronics": ["laptop", "phone", "tablet", "headphones", "camera", "computer", "macbook", "iphone", "samsung", 
                           "galaxy", "ipad", "airpods", "sony", "bose", "canon", "nintendo", "playstation", "xbox", "tesla",
                           "battery", "screen", "display", "processor", "chip", "memory", "storage", "bluetooth", "wifi",
                           "charging", "usb", "hdmi", "speaker", "microphone", "sensor", "lens", "zoom", "resolution"],
            "beauty": ["sunscreen", "moisturizer", "cream", "lotion", "serum", "makeup", "lipstick", "foundation", "concealer",
                      "mascara", "eyeshadow", "blush", "bronzer", "primer", "setting", "spray", "cleanser", "toner", "exfoliant",
                      "vitamin", "retinol", "hyaluronic", "collagen", "spf", "uv", "protection", "anti-aging", "skincare"],
            "home": ["furniture", "decor", "kitchen", "appliance", "cookware", "bedding", "pillow", "mattress", "sofa", "chair",
                    "table", "lamp", "mirror", "vase", "candle", "rug", "curtain", "blinds", "shelf", "cabinet", "storage"],
            "clothing": ["shirt", "pants", "dress", "shoes", "jacket", "sweater", "jeans", "shorts", "skirt", "blouse",
                        "sneakers", "boots", "sandals", "hat", "cap", "belt", "bag", "purse", "backpack", "watch", "jewelry"],
            "books": ["book", "novel", "textbook", "manual", "guide", "dictionary", "encyclopedia", "magazine", "journal",
                     "paperback", "hardcover", "ebook", "kindle", "author", "publisher", "edition", "chapter", "page"],
            "automotive": ["car", "truck", "suv", "vehicle", "tire", "brake", "engine", "transmission", "battery", "oil",
                          "filter", "spark", "plug", "belt", "hose", "radiator", "alternator", "starter", "fuel", "gas"],
            "other": ["general", "miscellaneous", "various", "assorted", "mixed", "random", "unknown", "unclear"]
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
        
        # Apply metadata hints if available
        if metadata_hints and 'suggested_category' in metadata_hints:
            suggested_category = metadata_hints['suggested_category']
            if suggested_category in categories:
                # Boost the suggested category's score
                scores[suggested_category] = max(scores.get(suggested_category, 0), 0.8)
        
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
    
    def fallback_sentiment(self, text: str) -> Dict[str, Any]:
        """Fallback sentiment analysis using product review keywords"""
        positive_words = ["amazing", "excellent", "perfect", "love", "great", "wonderful", "fantastic", "incredible", 
                         "stunning", "beautiful", "premium", "outstanding", "impressive", "smooth", "fast", "reliable",
                         "comfortable", "crisp", "clear", "sharp", "brilliant", "superb", "top-notch", "high-quality",
                         "worth", "recommend", "satisfied", "pleased", "happy", "delighted", "thrilled", "excited"]
        negative_words = ["terrible", "awful", "disappointing", "hate", "dislike", "bad", "poor", "cheap", "flimsy",
                         "slow", "heavy", "bulky", "uncomfortable", "blurry", "fuzzy", "grainy", "noisy", "crackling",
                         "broken", "defective", "flawed", "useless", "waste", "regret", "frustrated", "annoyed", "angry",
                         "sad", "upset", "disappointed", "unhappy", "unsatisfied", "problem", "issue", "bug", "glitch"]
        
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
    
    def add_correction(self, text: str, original_labels: Dict, corrected_labels: Dict, 
                      confidence: float, task_type: str):
        """Add annotator correction to training data"""
        correction = {
            "text": text,
            "original_labels": original_labels,
            "corrected_labels": corrected_labels,
            "original_confidence": confidence,
            "task_type": task_type,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.training_data.append(correction)
        print(f"Added correction #{len(self.training_data)} for {task_type}")
        
        # Check if we should retrain
        if len(self.training_data) >= self.retrain_threshold:
            self.retrain_model()
    
    def retrain_model(self):
        """Simulate model retraining with confidence adjustments"""
        if not self.training_data:
            return
        
        print(f"🔄 Simulating model retraining with {len(self.training_data)} corrections...")
        
        # Group corrections by task type
        corrections_by_type = {}
        for correction in self.training_data:
            task_type = correction["task_type"]
            if task_type not in corrections_by_type:
                corrections_by_type[task_type] = []
            corrections_by_type[task_type].append(correction)
        
        # Apply learning adjustments for each task type
        for task_type, corrections in corrections_by_type.items():
            self._apply_learning_adjustments(task_type, corrections)
        
        # Clear training data after "retraining"
        self.training_data = []
        print("✅ Model learning adjustments applied!")
    
    def _apply_learning_adjustments(self, task_type: str, corrections: List[Dict]):
        """Apply learning adjustments based on corrections"""
        print(f"Applying learning adjustments for {task_type} with {len(corrections)} corrections...")
        
        # Initialize task type adjustments if not exists
        if task_type not in self.confidence_adjustments:
            self.confidence_adjustments[task_type] = {
                "overconfident_cases": 0,
                "underconfident_cases": 0,
                "total_corrections": 0,
                "accuracy_improvement": 0.0
            }
        
        if task_type not in self.error_patterns:
            self.error_patterns[task_type] = {}
        
        # Analyze corrections
        overconfident = 0
        underconfident = 0
        common_errors = {}
        
        for correction in corrections:
            original_conf = correction["original_confidence"]
            labels_changed = correction["original_labels"] != correction["corrected_labels"]
            
            if labels_changed:
                if original_conf > 0.8:
                    overconfident += 1
                elif original_conf < 0.4:
                    underconfident += 1
                
                # Track error patterns
                self._track_error_patterns(task_type, correction, common_errors)
        
        # Update adjustments
        self.confidence_adjustments[task_type]["overconfident_cases"] += overconfident
        self.confidence_adjustments[task_type]["underconfident_cases"] += underconfident
        self.confidence_adjustments[task_type]["total_corrections"] += len(corrections)
        
        # Calculate simulated accuracy improvement
        accuracy_boost = min(len(corrections) * 0.02, 0.15)  # Max 15% improvement
        self.confidence_adjustments[task_type]["accuracy_improvement"] += accuracy_boost
        
        # Update error patterns
        for error, count in common_errors.items():
            if error in self.error_patterns[task_type]:
                self.error_patterns[task_type][error] += count
            else:
                self.error_patterns[task_type][error] = count
        
        print(f"  - Overconfident cases: {overconfident}")
        print(f"  - Underconfident cases: {underconfident}")
        print(f"  - Common errors: {common_errors}")
        print(f"  - Simulated accuracy boost: +{accuracy_boost:.1%}")
    
    def _track_error_patterns(self, task_type: str, correction: Dict, common_errors: Dict):
        """Track error patterns for learning"""
        original = correction["original_labels"]
        corrected = correction["corrected_labels"]
        
        if task_type == "ner" and "entities" in original and "entities" in corrected:
            # Track entity type misclassifications
            orig_entities = {e["text"]: e["label"] for e in original.get("entities", [])}
            corr_entities = {e["text"]: e["label"] for e in corrected.get("entities", [])}
            
            for entity_text, orig_label in orig_entities.items():
                if entity_text in corr_entities:
                    corr_label = corr_entities[entity_text]
                    if orig_label != corr_label:
                        error_key = f"{orig_label}->{corr_label}"
                        common_errors[error_key] = common_errors.get(error_key, 0) + 1
        
        elif task_type == "sentiment" and "sentiment" in original and "sentiment" in corrected:
            orig_sentiment = original["sentiment"]
            corr_sentiment = corrected["sentiment"]
            if orig_sentiment != corr_sentiment:
                error_key = f"{orig_sentiment}->{corr_sentiment}"
                common_errors[error_key] = common_errors.get(error_key, 0) + 1
        
        elif task_type == "classification" and "category" in original and "category" in corrected:
            orig_category = original["category"]
            corr_category = corrected["category"]
            if orig_category != corr_category:
                error_key = f"{orig_category}->{corr_category}"
                common_errors[error_key] = common_errors.get(error_key, 0) + 1
    
    def _analyze_ner_errors(self, correction: Dict, common_errors: Dict):
        """Analyze NER correction patterns"""
        original = correction["original_labels"]
        corrected = correction["corrected_labels"]
        
        # Track entity type misclassifications
        if "entities" in original and "entities" in corrected:
            orig_entities = {e["text"]: e["label"] for e in original["entities"]}
            corr_entities = {e["text"]: e["label"] for e in corrected["entities"]}
            
            for entity_text, orig_label in orig_entities.items():
                if entity_text in corr_entities:
                    corr_label = corr_entities[entity_text]
                    if orig_label != corr_label:
                        error_key = f"{orig_label}->{corr_label}"
                        common_errors[error_key] = common_errors.get(error_key, 0) + 1
    
    def _analyze_sentiment_errors(self, correction: Dict, common_errors: Dict):
        """Analyze sentiment correction patterns"""
        original = correction["original_labels"]
        corrected = correction["corrected_labels"]
        
        if "sentiment" in original and "sentiment" in corrected:
            orig_sentiment = original["sentiment"]
            corr_sentiment = corrected["sentiment"]
            
            if orig_sentiment != corr_sentiment:
                error_key = f"{orig_sentiment}->{corr_sentiment}"
                common_errors[error_key] = common_errors.get(error_key, 0) + 1
    
    def _analyze_classification_errors(self, correction: Dict, common_errors: Dict):
        """Analyze classification correction patterns"""
        original = correction["original_labels"]
        corrected = correction["corrected_labels"]
        
        if "category" in original and "category" in corrected:
            orig_category = original["category"]
            corr_category = corrected["category"]
            
            if orig_category != corr_category:
                error_key = f"{orig_category}->{corr_category}"
                common_errors[error_key] = common_errors.get(error_key, 0) + 1
    
    def _apply_learning_adjustments(self, task_type: str, confidence_adjustments: List, common_errors: Dict):
        """Apply learned adjustments to improve future predictions"""
        print(f"Applying learning adjustments for {task_type}:")
        print(f"  - Confidence adjustments: {len(confidence_adjustments)}")
        print(f"  - Common errors: {common_errors}")
        
        # In a real implementation, this would:
        # 1. Adjust confidence thresholds
        # 2. Update model weights
        # 3. Add new training examples
        # 4. Fine-tune transformer models
        
        # For demo purposes, we'll just log the adjustments
        if confidence_adjustments:
            print(f"  - Model was overconfident in {len(confidence_adjustments)} cases")
        
        if common_errors:
            print(f"  - Most common errors: {sorted(common_errors.items(), key=lambda x: x[1], reverse=True)[:3]}")
    
    def get_training_stats(self):
        """Get statistics about training data and model performance"""
        return {
            "total_corrections": len(self.training_data),
            "retrain_threshold": self.retrain_threshold,
            "next_retrain_in": max(0, self.retrain_threshold - len(self.training_data)),
            "corrections_by_type": self._get_corrections_by_type(),
            "learning_adjustments": self.confidence_adjustments,
            "error_patterns": self.error_patterns,
            "learning_enabled": self.learning_enabled
        }
    
    def apply_confidence_adjustment(self, task_type: str, original_confidence: float) -> float:
        """Apply learning-based confidence adjustments"""
        if not self.learning_enabled or task_type not in self.confidence_adjustments:
            return original_confidence
        
        adjustments = self.confidence_adjustments[task_type]
        
        # Adjust confidence based on learning
        if adjustments["overconfident_cases"] > adjustments["underconfident_cases"]:
            # Model was overconfident, reduce confidence slightly
            adjustment_factor = 0.95
        elif adjustments["underconfident_cases"] > adjustments["overconfident_cases"]:
            # Model was underconfident, increase confidence slightly
            adjustment_factor = 1.05
        else:
            # Balanced, no adjustment
            adjustment_factor = 1.0
        
        # Apply adjustment with bounds
        adjusted_confidence = original_confidence * adjustment_factor
        return max(0.1, min(0.99, adjusted_confidence))
    
    def get_learning_insights(self, task_type: str) -> Dict:
        """Get learning insights for a specific task type"""
        if task_type not in self.confidence_adjustments:
            return {"message": "No learning data available yet"}
        
        adjustments = self.confidence_adjustments[task_type]
        error_patterns = self.error_patterns.get(task_type, {})
        
        insights = {
            "total_corrections": adjustments["total_corrections"],
            "accuracy_improvement": f"+{adjustments['accuracy_improvement']:.1%}",
            "overconfident_cases": adjustments["overconfident_cases"],
            "underconfident_cases": adjustments["underconfident_cases"],
            "most_common_errors": sorted(error_patterns.items(), key=lambda x: x[1], reverse=True)[:3],
            "learning_status": "Active" if self.learning_enabled else "Disabled"
        }
        
        return insights
    
    def _get_corrections_by_type(self):
        """Get breakdown of corrections by task type"""
        type_counts = {}
        for correction in self.training_data:
            task_type = correction["task_type"]
            type_counts[task_type] = type_counts.get(task_type, 0) + 1
        return type_counts
