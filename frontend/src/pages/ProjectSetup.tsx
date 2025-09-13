import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectApi } from '../services/api';

export const ProjectSetup: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [taskType, setTaskType] = useState('ner');
  const [file, setFile] = useState<File | null>(null);
  const [createdProject, setCreatedProject] = useState<any>(null);

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    setLoading(true);
    try {
      const project = await projectApi.create({
        name: projectName,
        description: projectDescription,
        task_type: taskType
      });
      
      setCreatedProject(project);
      setStep(2);
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadDataset = async () => {
    if (!file || !createdProject) return;
    
    setLoading(true);
    try {
      const result = await projectApi.uploadDataset(createdProject.id, file);
      console.log('Upload successful:', result);
      setStep(3);
    } catch (error: any) {
      console.error('Error uploading dataset:', error);
      console.error('Error details:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoLabel = async () => {
    if (!createdProject) return;
    
    setLoading(true);
    try {
      await projectApi.autoLabel(createdProject.id, taskType, 100);
      setStep(4);
    } catch (error) {
      console.error('Error running auto-labeling:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    navigate(`/annotate/${createdProject.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((stepNum) => (
            <div key={stepNum} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= stepNum ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {stepNum}
              </div>
              {stepNum < 4 && (
                <div className={`w-24 h-1 mx-2 ${
                  step > stepNum ? 'bg-primary-500' : 'bg-gray-200'
                }`}></div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-600">
          <span>Project Info</span>
          <span>Upload Data</span>
          <span>Auto-Label</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-md p-8">
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Project</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter project name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none h-24 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Describe your annotation project"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Task Type *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { value: 'ner', label: 'Named Entity Recognition', desc: 'Extract entities like names, places, dates' },
                    { value: 'sentiment', label: 'Sentiment Analysis', desc: 'Classify text as positive, negative, neutral' },
                    { value: 'classification', label: 'Text Classification', desc: 'Categorize text into predefined classes' }
                  ].map((option) => (
                    <div
                      key={option.value}
                      onClick={() => setTaskType(option.value)}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        taskType === option.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium text-gray-900">{option.label}</div>
                      <div className="text-sm text-gray-600 mt-1">{option.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-8">
              <button
                onClick={handleCreateProject}
                disabled={!projectName.trim() || loading}
                className="bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Upload Dataset</h2>
            
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Data Format Requirements</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• CSV file with a 'text' column containing your text data</li>
                  <li>• JSON file with array of objects containing 'text' field</li>
                  <li>• Maximum file size: 10MB</li>
                  <li>• Supported formats: .csv, .json</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Dataset File *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept=".csv,.json"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0] || null;
                      console.log('File selected:', selectedFile);
                      if (selectedFile) {
                        console.log('File details:', {
                          name: selectedFile.name,
                          size: selectedFile.size,
                          type: selectedFile.type,
                          lastModified: selectedFile.lastModified
                        });
                      }
                      setFile(selectedFile);
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="w-12 h-12 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div className="text-gray-600">
                      {file ? (
                        <span className="text-primary-600 font-medium">{file.name}</span>
                      ) : (
                        <>
                          <span className="text-primary-600 font-medium">Click to upload</span>
                          <span> or drag and drop</span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(1)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleUploadDataset}
                disabled={!file || loading}
                className="bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? 'Uploading...' : 'Upload Dataset'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Auto-Label Data</h2>
            
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-medium text-green-900 mb-2">✅ Dataset Uploaded Successfully</h3>
                <p className="text-sm text-green-800">Your data is ready for auto-labeling.</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-medium text-yellow-900 mb-2">Auto-Labeling Process</h3>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• AI models will generate initial labels for your data</li>
                  <li>• Confidence scores will be calculated for each prediction</li>
                  <li>• Low-confidence items will be prioritized for human review</li>
                  <li>• This process may take a few minutes depending on data size</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setStep(2)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleAutoLabel}
                disabled={loading}
                className="bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                {loading ? 'Auto-Labeling...' : 'Start Auto-Labeling'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Project Ready!</h2>
            
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-green-900 mb-2">Auto-Labeling Complete</h3>
                <p className="text-green-800">Your project is ready for annotation review.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Next Steps</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Review auto-generated labels</li>
                    <li>• Make corrections as needed</li>
                    <li>• Share client portal for feedback</li>
                    <li>• Export final labeled dataset</li>
                  </ul>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Quick Links</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => navigate(`/annotate/${createdProject.id}`)}
                      className="w-full text-left text-sm text-primary-600 hover:text-primary-700"
                    >
                      → Annotator Workspace
                    </button>
                    <button
                      onClick={() => navigate(`/client/${createdProject.id}`)}
                      className="w-full text-left text-sm text-primary-600 hover:text-primary-700"
                    >
                      → Client Portal
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-8">
              <button
                onClick={handleComplete}
                className="bg-primary-500 hover:bg-primary-600 text-white px-8 py-3 rounded-lg font-medium transition-colors"
              >
                Start Annotating
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
