import spacy
from typing import Dict, List, Any
from datetime import datetime

class AutoLabeler:
    def __init__(self):
        """Initialize auto-labeling models"""
        self.models = {}
        self.training_data = []  # Store corrections for analysis
        self.load_models()
    
    def load_models(self):
        """Load pre-trained models for different languages"""
        # Define supported languages and their spaCy models
        self.supported_languages = {
            'en': 'en_core_web_sm',
            'es': 'es_core_news_sm', 
            'fr': 'fr_core_news_sm',
            'de': 'de_core_news_sm',
            'it': 'it_core_news_sm',
            'pt': 'pt_core_news_sm',
            'ru': 'ru_core_news_sm',
            'zh': 'zh_core_web_sm',
            'ja': 'ja_core_news_sm',
            'ko': 'ko_core_news_sm',
            'ar': 'ar_core_news_sm',
            'nl': 'nl_core_news_sm',
            'el': 'el_core_news_sm',
            'pl': 'pl_core_news_sm',
            'nb': 'nb_core_news_sm',
            'sv': 'sv_core_news_sm',
            'da': 'da_core_news_sm',
            'fi': 'fi_core_news_sm',
            'hu': 'hu_core_news_sm',
            'ro': 'ro_core_news_sm',
            'bg': 'bg_core_news_sm',
            'hr': 'hr_core_news_sm',
            'sl': 'sl_core_news_sm',
            'lt': 'lt_core_news_sm',
            'lv': 'lv_core_news_sm',
            'et': 'et_core_news_sm',
            'uk': 'uk_core_news_sm',
            'mk': 'mk_core_news_sm',
            'sr': 'sr_core_news_sm',
            'bs': 'bs_core_news_sm',
            'me': 'me_core_news_sm',
            'sq': 'sq_core_news_sm',
            'tr': 'tr_core_news_sm',
            'he': 'he_core_news_sm',
            'hi': 'hi_core_news_sm',
            'bn': 'bn_core_news_sm',
            'id': 'id_core_news_sm',
            'th': 'th_core_news_sm',
            'vi': 'vi_core_news_sm',
            'uz': 'uz_core_news_sm',
            'kk': 'kk_core_news_sm',
            'ky': 'ky_core_news_sm',
            'tg': 'tg_core_news_sm',
            'tk': 'tk_core_news_sm',
            'az': 'az_core_news_sm',
            'ka': 'ka_core_news_sm',
            'hy': 'hy_core_news_sm',
            'mn': 'mn_core_news_sm',
            'km': 'km_core_news_sm',
            'lo': 'lo_core_news_sm',
            'my': 'my_core_news_sm',
            'si': 'si_core_news_sm',
            'ne': 'ne_core_news_sm',
            'dz': 'dz_core_news_sm',
            'dv': 'dv_core_news_sm',
            'syl': 'syl_core_news_sm'
        }
        
        # Load models for supported languages
        for lang_code, model_name in self.supported_languages.items():
            try:
                self.models[lang_code] = spacy.load(model_name)
                print(f"✅ Loaded {lang_code} model: {model_name}")
            except OSError:
                print(f"⚠️  {model_name} not found. Install with: python -m spacy download {model_name}")
                self.models[lang_code] = None
        
        # Set default model to English
        self.default_model = self.models.get('en')
        if not self.default_model:
            print("⚠️  English model not found. Some features may not work.")
    
    def get_model_for_language(self, language: str):
        """Get the appropriate model for a given language"""
        if language in self.models and self.models[language] is not None:
            return self.models[language]
        else:
            print(f"⚠️  Model for language '{language}' not available, falling back to English")
            return self.default_model
        
        # Sentiment analysis and text classification models removed - only NER supported
    
    def label_text(self, text: str, task_type: str, language: str = 'en', metadata_hints: Dict = None, entity_classes: List[str] = None) -> Dict[str, Any]:
        """
        Main method to auto-label text based on task type and language
        
        Args:
            text: Input text to label
            task_type: Type of labeling task (only "ner" supported)
            language: Language code (e.g., 'en', 'es', 'fr', etc.)
            metadata_hints: Optional metadata hints (not used for NER)
            entity_classes: List of entity classes to include (e.g., ['PER', 'LOC', 'ORG', 'MISC'])
        
        Returns:
            Dictionary with labels and metadata
        """
        if task_type == "ner":
            result = self.extract_entities(text, language, entity_classes)
        else:
            # Fallback to NER for unsupported task types
            print(f"⚠️  Unsupported task type '{task_type}', falling back to NER")
            result = self.extract_entities(text, language, entity_classes)
        
        return result
    
    def extract_entities(self, text: str, language: str = 'en', entity_classes: List[str] = None) -> Dict[str, Any]:
        """Extract named entities using spaCy for the specified language, filtering by selected entity classes"""
        # Get the appropriate model for the language
        nlp = self.get_model_for_language(language)
        
        # Default to all entity classes if none specified
        if entity_classes is None:
            entity_classes = ['PER', 'LOC', 'ORG']
        
        if not nlp:
            # Return empty result if no model is available
            return {
                "labels": {
                    "entities": [],
                    "entity_count": 0,
                    "entity_types": [],
                    "selected_classes": entity_classes
                },
                "model_used": f"spacy_{language}_unavailable",
                "language": language,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        try:
            doc = nlp(text)
            entities = []
            
            # Language-specific entity type mapping
            entity_mapping = self._get_entity_mapping(language)
            
            for ent in doc.ents:
                # Map spaCy labels to our target labels based on language
                class_name = entity_mapping.get(ent.label_, 'MISC')
                
                # Only include entities that match the selected classes
                if class_name in entity_classes:
                    entities.append({
                        "class_name": class_name,
                        "start_index": ent.start_char,
                        "end_index": ent.end_char,
                        "text": ent.text,
                        "original_label": ent.label_,
                        "language": language
                    })
            
            model_name = self.supported_languages.get(language, f"spacy_{language}")
            
            return {
                "labels": {
                    "entities": entities,
                    "entity_count": len(entities),
                    "entity_types": list(set([ent["class_name"] for ent in entities])),
                    "selected_classes": entity_classes
                },
                "model_used": model_name,
                "language": language,
                "timestamp": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            print(f"Error in NER for language {language}: {e}")
            return {
                "labels": {
                    "entities": [],
                    "entity_count": 0,
                    "entity_types": []
                },
                "model_used": f"spacy_{language}_error",
                "language": language,
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def _get_entity_mapping(self, language: str) -> Dict[str, str]:
        """Get entity type mapping for different languages"""
        # Base mapping for most languages
        base_mapping = {
            'PERSON': 'PER',
            'PER': 'PER',
            'GPE': 'LOC',  # Geopolitical entity
            'LOC': 'LOC',  # Location
            'LOCATION': 'LOC',
            'EVENT': 'LOC',  # Historical events
            'ORG': 'ORG',   # Organization
            'ORGANIZATION': 'ORG',
            'MISC': 'MISC',
            'MISCELLANEOUS': 'MISC'
        }
        
        # Language-specific mappings
        language_mappings = {
            'zh': {  # Chinese
                **base_mapping,
                'PERSON': 'PER',
                'GPE': 'LOC',
                'ORG': 'ORG',
                'WORK_OF_ART': 'MISC',
                'DATE': 'MISC',
                'TIME': 'MISC'
            },
            'ar': {  # Arabic
                **base_mapping,
                'PERSON': 'PER',
                'GPE': 'LOC',
                'ORG': 'ORG'
            },
            'ja': {  # Japanese
                **base_mapping,
                'PERSON': 'PER',
                'GPE': 'LOC',
                'ORG': 'ORG'
            },
            'ko': {  # Korean
                **base_mapping,
                'PERSON': 'PER',
                'GPE': 'LOC',
                'ORG': 'ORG'
            }
        }
        
        return language_mappings.get(language, base_mapping)
    
    def get_supported_languages(self) -> Dict[str, str]:
        """Get list of supported languages"""
        return {
            code: name for code, name in [
                ('en', 'English'),
                ('es', 'Spanish'),
                ('fr', 'French'),
                ('de', 'German'),
                ('it', 'Italian'),
                ('pt', 'Portuguese'),
                ('ru', 'Russian'),
                ('zh', 'Chinese'),
                ('ja', 'Japanese'),
                ('ko', 'Korean'),
                ('ar', 'Arabic'),
                ('nl', 'Dutch'),
                ('el', 'Greek'),
                ('pl', 'Polish'),
                ('nb', 'Norwegian'),
                ('sv', 'Swedish'),
                ('da', 'Danish'),
                ('fi', 'Finnish'),
                ('hu', 'Hungarian'),
                ('ro', 'Romanian'),
                ('bg', 'Bulgarian'),
                ('hr', 'Croatian'),
                ('sl', 'Slovenian'),
                ('lt', 'Lithuanian'),
                ('lv', 'Latvian'),
                ('et', 'Estonian'),
                ('uk', 'Ukrainian'),
                ('mk', 'Macedonian'),
                ('sr', 'Serbian'),
                ('bs', 'Bosnian'),
                ('me', 'Montenegrin'),
                ('sq', 'Albanian'),
                ('tr', 'Turkish'),
                ('he', 'Hebrew'),
                ('hi', 'Hindi'),
                ('bn', 'Bengali'),
                ('id', 'Indonesian'),
                ('th', 'Thai'),
                ('vi', 'Vietnamese'),
                ('uz', 'Uzbek'),
                ('kk', 'Kazakh'),
                ('ky', 'Kyrgyz'),
                ('tg', 'Tajik'),
                ('tk', 'Turkmen'),
                ('az', 'Azerbaijani'),
                ('ka', 'Georgian'),
                ('hy', 'Armenian'),
                ('mn', 'Mongolian'),
                ('km', 'Khmer'),
                ('lo', 'Lao'),
                ('my', 'Burmese'),
                ('si', 'Sinhala'),
                ('ne', 'Nepali'),
                ('dz', 'Dzongkha'),
                ('dv', 'Dhivehi'),
                ('syl', 'Sylheti')
            ]
        }
    
    # Sentiment analysis and text classification methods removed - only NER supported
    
    def add_correction(self, text: str, original_labels: Dict, corrected_labels: Dict, 
                      task_type: str):
        """Add annotator correction to training data for analysis"""
        correction = {
            "text": text,
            "original_labels": original_labels,
            "corrected_labels": corrected_labels,
            "task_type": task_type,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        self.training_data.append(correction)
        print(f"Added correction #{len(self.training_data)} for {task_type}")
    
    def _get_corrections_by_type(self) -> Dict[str, int]:
        """Get count of corrections by task type"""
        corrections_by_type = {}
        for correction in self.training_data:
            task_type = correction["task_type"]
            corrections_by_type[task_type] = corrections_by_type.get(task_type, 0) + 1
        return corrections_by_type
    
    def get_training_stats(self):
        """Get statistics about training data"""
        return {
            "total_corrections": len(self.training_data),
            "corrections_by_type": self._get_corrections_by_type()
        }