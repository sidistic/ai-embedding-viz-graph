'use client';
import React, { useCallback, useRef, useState } from 'react';
import { DataPoint, DataProcessingOptions, ProcessingProgress } from '@/types';
import { DataProcessor } from '@/lib/dataProcessor';

interface FileUploadProps {
  onFileLoad: (data: DataPoint[]) => void;
  onError: (error: string) => void;
  onProgress?: (progress: ProcessingProgress) => void;
}

export default function FileUpload({ onFileLoad, onError, onProgress }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const processingRef = useRef(false);

  const processFile = useCallback(async (file: File) => {
    if (!file || processingRef.current) return;

    processingRef.current = true;
    setIsLoading(true);
    setFileInfo({
      name: file.name,
      size: file.size,
      type: file.type
    });
    onError(''); // Clear previous errors

    try {
      // Check file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 50MB limit`);
      }

      onProgress?.({
        stage: 'loading',
        progress: 5,
        current: 0,
        total: 1,
        message: 'Reading file...'
      });

      const content = await readFileContent(file);
      let data: DataPoint[] = [];

      const processingOptions: DataProcessingOptions = {
        chunkSize: 1000,
        skipValidation: file.size > 10 * 1024 * 1024, // Skip validation for files > 10MB
        maxFileSize: 50,
        supportedFormats: ['.json', '.csv', '.txt']
      };

      if (file.name.toLowerCase().endsWith('.json')) {
        data = await DataProcessor.loadJSONData(content, processingOptions, onProgress);
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        data = await DataProcessor.loadCSVData(content, processingOptions, onProgress);
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        // Handle plain text files
        data = await processTxtFile(content, onProgress);
      } else {
        throw new Error('Unsupported file format. Please use CSV, JSON, or TXT files.');
      }

      if (data.length === 0) {
        throw new Error('No valid data found in file. Please check the file format.');
      }

      // Log successful loading info
      const stats = DataProcessor.getDataStats(data);
      console.log('File loaded successfully:', {
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        totalItems: stats.totalItems,
        withEmbeddings: stats.withEmbeddings,
        categories: stats.categories,
        embeddingDimensions: stats.embeddingDimensions,
        processingTime: `${stats.processingTime}ms`
      });

      onFileLoad(data);
      
      onProgress?.({
        stage: 'complete',
        progress: 100,
        current: data.length,
        total: data.length,
        message: `Successfully loaded ${data.length} items from ${file.name}`
      });

    } catch (error: any) {
      console.error('File processing error:', error);
      onError(error.message || 'Failed to process file');
    } finally {
      setIsLoading(false);
      processingRef.current = false;
      setFileInfo(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onFileLoad, onError, onProgress]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !processingRef.current) {
      processFile(file);
    }
  }, [processFile]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file && !processingRef.current) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!processingRef.current) {
      fileInputRef.current?.click();
    }
  }, []);

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200
          ${isDragging 
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-600 hover:border-gray-500'
          }
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800/50'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.txt"
          onChange={handleFileChange}
          disabled={isLoading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ display: 'none' }}
        />
        
        <div className="space-y-2">
          {isLoading ? (
            <>
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-blue-400 font-medium">Processing file...</p>
              {fileInfo && (
                <div className="text-xs text-gray-400">
                  <div>{fileInfo.name}</div>
                  <div>{(fileInfo.size / 1024 / 1024).toFixed(2)}MB</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-4xl text-gray-400 mb-2">📁</div>
              <p className="text-white font-medium">
                {isDragging ? 'Drop file here' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-gray-400 text-sm">
                Supports CSV, JSON, and TXT files (up to 50MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Enhanced File Format Info */}
      <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
        <h4 className="text-white font-medium mb-3">Supported File Formats:</h4>
        <div className="space-y-3 text-gray-300">
          <div>
            <span className="font-medium text-blue-400">CSV:</span>
            <div className="ml-4 text-xs space-y-1">
              <div>• Required: 'text' column</div>
              <div>• Optional: 'id', 'category', 'title', 'description'</div>
              <div>• Optional: 'embedding' (JSON array), 'metadata' (JSON object)</div>
            </div>
          </div>
          
          <div>
            <span className="font-medium text-green-400">JSON:</span>
            <div className="ml-4 text-xs space-y-1">
              <div>• Array of objects with 'text' property</div>
              <div>• Optional: 'id', 'category', 'embedding', 'metadata'</div>
              <div>• Supports nested objects and arrays</div>
            </div>
          </div>

          <div>
            <span className="font-medium text-yellow-400">TXT:</span>
            <div className="ml-4 text-xs space-y-1">
              <div>• Plain text file (one item per line)</div>
              <div>• Lines starting with '#' are treated as categories</div>
              <div>• Automatic paragraph detection</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sample Data Buttons */}
      <div className="grid grid-cols-1 gap-2">
        <button
          onClick={() => loadSampleData('ag_news')}
          disabled={isLoading || processingRef.current}
          className="w-full p-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
        >
          Load Sample: AG News Dataset (20 items)
        </button>

        <button
          onClick={() => loadSampleData('reddit')}
          disabled={isLoading || processingRef.current}
          className="w-full p-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
        >
          Load Sample: Reddit Comments (15 items)
        </button>

        <button
          onClick={() => loadSampleData('research_papers')}
          disabled={isLoading || processingRef.current}
          className="w-full p-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded transition-colors text-sm"
        >
          Load Sample: Research Papers (10 items)
        </button>
      </div>

      {/* Performance Tips */}
      <details className="bg-gray-700/30 rounded p-3">
        <summary className="text-sm text-gray-300 cursor-pointer hover:text-white">
          💡 Performance Tips for Large Datasets
        </summary>
        <div className="mt-2 text-xs text-gray-400 space-y-1">
          <div>• Files &gt;10MB: validation is skipped for faster processing</div>
          <div>• Optimal batch size: 1000-5000 items per embedding generation</div>
          <div>• Consider splitting very large files (&gt;100k items) for better performance</div>
          <div>• Use CSV for faster parsing of structured data</div>
          <div>• Pre-clean your data to remove empty or duplicate entries</div>
        </div>
      </details>
    </div>
  );

  // Load sample data function
  async function loadSampleData(type: 'ag_news' | 'reddit' | 'research_papers') {
    if (processingRef.current) return;
    
    processingRef.current = true;
    setIsLoading(true);
    
    try {
      onProgress?.({
        stage: 'loading',
        progress: 10,
        current: 0,
        total: 1,
        message: 'Generating sample data...'
      });

      const sampleData = await generateSampleData(type, onProgress);
      onFileLoad(sampleData);
    } catch (error: any) {
      onError(error.message);
    } finally {
      setIsLoading(false);
      processingRef.current = false;
    }
  }
}

// Utility function to read file content
function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      resolve(content);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

// Process plain text files
async function processTxtFile(
  content: string,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<DataPoint[]> {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const dataPoints: DataPoint[] = [];
  let currentCategory = 'General';
  
  onProgress?.({
    stage: 'parsing',
    progress: 20,
    current: 0,
    total: lines.length,
    message: 'Processing text lines...'
  });

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Lines starting with # are categories
    if (trimmedLine.startsWith('#')) {
      currentCategory = trimmedLine.substring(1).trim();
      return;
    }
    
    // Skip very short lines
    if (trimmedLine.length < 10) return;
    
    dataPoints.push({
      id: `txt_${index + 1}`,
      text: trimmedLine,
      category: currentCategory,
      metadata: {
        lineNumber: index + 1,
        source: 'txt_upload'
      }
    });

    if (index % 100 === 0) {
      onProgress?.({
        stage: 'parsing',
        progress: 20 + (index / lines.length) * 60,
        current: index,
        total: lines.length,
        message: `Processed ${index}/${lines.length} lines...`
      });
    }
  });

  onProgress?.({
    stage: 'validating',
    progress: 85,
    current: dataPoints.length,
    total: dataPoints.length,
    message: 'Validating processed data...'
  });

  return dataPoints;
}

// Enhanced sample data generators
async function generateSampleData(
  type: 'ag_news' | 'reddit' | 'research_papers',
  onProgress?: (progress: ProcessingProgress) => void
): Promise<DataPoint[]> {
  
  onProgress?.({
    stage: 'loading',
    progress: 20,
    current: 0,
    total: 1,
    message: 'Generating sample data...'
  });

  let sampleData: DataPoint[] = [];

  switch (type) {
    case 'ag_news':
      sampleData = [
        {
          id: 'ag_1',
          text: 'Breaking: Climate Summit Reaches Historic Agreement on Carbon Emissions with 195 Countries Signing Landmark Deal',
          category: 'World',
          metadata: { source: 'Reuters', date: '2024-01-15', importance: 'high' }
        },
        {
          id: 'ag_2', 
          text: 'NBA Finals Game 7: Lakers Defeat Celtics 108-102 in Epic Championship Battle, LeBron James Named Finals MVP',
          category: 'Sports',
          metadata: { source: 'ESPN', date: '2024-01-14', sport: 'basketball' }
        },
        {
          id: 'ag_3',
          text: 'Federal Reserve Announces 0.25% Interest Rate Cut Amid Economic Uncertainty and Inflation Concerns',
          category: 'Business', 
          metadata: { source: 'Bloomberg', date: '2024-01-13', sector: 'finance' }
        },
        {
          id: 'ag_4',
          text: 'AI Breakthrough: New Language Model GPT-5 Demonstrates Advanced Reasoning Capabilities and Multimodal Understanding',
          category: 'Technology',
          metadata: { source: 'TechCrunch', date: '2024-01-12', sector: 'artificial_intelligence' }
        },
        {
          id: 'ag_5',
          text: 'European Union Implements Comprehensive Digital Privacy Regulations Affecting Tech Giants Across Global Markets',
          category: 'World',
          metadata: { source: 'BBC', date: '2024-01-11', region: 'europe' }
        },
        {
          id: 'ag_6',
          text: 'World Cup Qualifiers: Argentina Secures Victory Against Brazil 2-1 in Dramatic South American Tournament Final',
          category: 'Sports',
          metadata: { source: 'FIFA', date: '2024-01-10', sport: 'football' }
        },
        {
          id: 'ag_7',
          text: 'Tesla Announces Revolutionary Solid-State Battery Technology Promising 1000-Mile Range and 5-Minute Charging',
          category: 'Business',
          metadata: { source: 'MarketWatch', date: '2024-01-09', sector: 'automotive' }
        },
        {
          id: 'ag_8',
          text: 'Quantum Computing Milestone: IBM Achieves Error-Free Calculations on 1000-Qubit Processor for First Time',
          category: 'Technology',
          metadata: { source: 'Nature', date: '2024-01-08', sector: 'quantum_computing' }
        },
        {
          id: 'ag_9',
          text: 'Global Food Crisis: UN Reports 345 Million People Face Acute Food Insecurity Worldwide, Urgent Action Needed',
          category: 'World',
          metadata: { source: 'UN News', date: '2024-01-07', topic: 'humanitarian' }
        },
        {
          id: 'ag_10',
          text: 'Olympic Swimming Records Shattered: Katie Ledecky Breaks 1500m Freestyle World Record by 3 Seconds',
          category: 'Sports',
          metadata: { source: 'Olympic Channel', date: '2024-01-06', sport: 'swimming' }
        },
        {
          id: 'ag_11',
          text: 'Cryptocurrency Market Surge: Bitcoin Reaches $75,000 All-Time High as Institutional Adoption Accelerates',
          category: 'Business',
          metadata: { source: 'CoinDesk', date: '2024-01-05', sector: 'cryptocurrency' }
        },
        {
          id: 'ag_12',
          text: 'Space Exploration Success: SpaceX Falcon Heavy Launches Mars Colonization Mission with Advanced Life Support Systems',
          category: 'Technology',
          metadata: { source: 'Space News', date: '2024-01-04', sector: 'aerospace' }
        },
        {
          id: 'ag_13',
          text: 'International Trade Agreement: Pacific Nations Sign Comprehensive Economic Partnership Boosting Regional Commerce',
          category: 'World',
          metadata: { source: 'Trade Weekly', date: '2024-01-03', region: 'pacific' }
        },
        {
          id: 'ag_14',
          text: 'Tennis Grand Slam: Novak Djokovic Wins Record 25th Grand Slam Title at Australian Open, Extends GOAT Debate',
          category: 'Sports',
          metadata: { source: 'Tennis.com', date: '2024-01-02', sport: 'tennis' }
        },
        {
          id: 'ag_15',
          text: 'Green Energy Breakthrough: New Solar Panel Technology Achieves 50% Efficiency in Laboratory Testing',
          category: 'Technology',
          metadata: { source: 'Clean Energy News', date: '2024-01-01', sector: 'renewable_energy' }
        },
        {
          id: 'ag_16',
          text: 'Global Health Initiative: WHO Announces Successful Eradication of Malaria in 15 African Countries Through Innovative Vaccine Program',
          category: 'World',
          metadata: { source: 'WHO', date: '2023-12-31', topic: 'health' }
        },
        {
          id: 'ag_17',
          text: 'Major League Baseball: Home Run Record Broken as Aaron Judge Hits 75th Homer, Surpassing Babe Ruth Era',
          category: 'Sports',
          metadata: { source: 'MLB.com', date: '2023-12-30', sport: 'baseball' }
        },
        {
          id: 'ag_18',
          text: 'Stock Market Rally: S&P 500 Closes at Record High 6,000 Points Driven by Tech Sector and AI Investment Boom',
          category: 'Business',
          metadata: { source: 'Wall Street Journal', date: '2023-12-29', sector: 'finance' }
        },
        {
          id: 'ag_19',
          text: 'Medical Innovation: CRISPR Gene Therapy Successfully Cures Type 1 Diabetes in Clinical Trial Patients',
          category: 'Technology',
          metadata: { source: 'Medical Journal', date: '2023-12-28', sector: 'biotechnology' }
        },
        {
          id: 'ag_20',
          text: 'Climate Action: Amazon Rainforest Deforestation Drops to Lowest Level in 50 Years Following International Conservation Efforts',
          category: 'World',
          metadata: { source: 'Environmental Times', date: '2023-12-27', topic: 'environment' }
        }
      ];
      break;

    case 'reddit':
      sampleData = [
        {
          id: 'reddit_1',
          text: 'What productivity app changed your life? I recently started using Notion and it completely transformed how I organize my thoughts and projects.',
          category: 'AskReddit',
          metadata: { subreddit: 'AskReddit', upvotes: 2847, comments: 892 }
        },
        {
          id: 'reddit_2',
          text: 'The new iPhone 15 Pro Max camera is incredible for astrophotography. Here are some shots I took of the Milky Way last weekend without any additional equipment.',
          category: 'Technology',
          metadata: { subreddit: 'photography', upvotes: 15672, comments: 234 }
        },
        {
          id: 'reddit_3',
          text: 'LPT: When learning a new language, change your phone interface to that language. You use your phone so much that you\'ll pick up common words quickly.',
          category: 'LifeProTips',
          metadata: { subreddit: 'LifeProTips', upvotes: 8934, comments: 456 }
        },
        {
          id: 'reddit_4',
          text: 'Scientists have successfully reversed aging in mice using a new gene therapy technique. Human trials are expected to begin next year.',
          category: 'Science',
          metadata: { subreddit: 'science', upvotes: 12567, comments: 1203 }
        },
        {
          id: 'reddit_5',
          text: 'After 15 years of smoking, I finally quit cold turkey 6 months ago. The difference in my health and energy levels is remarkable.',
          category: 'PersonalGrowth',
          metadata: { subreddit: 'decidingtobebetter', upvotes: 5678, comments: 789 }
        },
        {
          id: 'reddit_6',
          text: 'The new electric vehicle charging infrastructure is expanding rapidly. Found 12 fast-charging stations on my road trip from LA to Seattle.',
          category: 'Technology',
          metadata: { subreddit: 'electricvehicles', upvotes: 3421, comments: 167 }
        },
        {
          id: 'reddit_7',
          text: 'Why do we still use QWERTY keyboards when more efficient layouts like Dvorak exist? Is it just tradition at this point?',
          category: 'AskReddit',
          metadata: { subreddit: 'AskReddit', upvotes: 7823, comments: 1456 }
        },
        {
          id: 'reddit_8',
          text: 'Breakthrough in quantum computing: Google\'s new chip solved a problem in 5 minutes that would take classical computers 10 quintillion years.',
          category: 'Technology',
          metadata: { subreddit: 'technology', upvotes: 18945, comments: 2134 }
        },
        {
          id: 'reddit_9',
          text: 'Started meditation 30 days ago using a simple breathing technique. My anxiety levels have decreased significantly and sleep quality improved.',
          category: 'PersonalGrowth',
          metadata: { subreddit: 'meditation', upvotes: 4567, comments: 298 }
        },
        {
          id: 'reddit_10',
          text: 'The James Webb Space Telescope images of distant galaxies are absolutely mind-blowing. We\'re seeing light from 13 billion years ago.',
          category: 'Science',
          metadata: { subreddit: 'space', upvotes: 23451, comments: 1876 }
        },
        {
          id: 'reddit_11',
          text: 'Remote work has changed everything about work-life balance. What are the long-term implications for city planning and real estate?',
          category: 'Discussion',
          metadata: { subreddit: 'futurology', upvotes: 6789, comments: 934 }
        },
        {
          id: 'reddit_12',
          text: 'Climate change is accelerating faster than predicted. The latest IPCC report shows we have even less time than we thought.',
          category: 'Environment',
          metadata: { subreddit: 'environment', upvotes: 11234, comments: 1567 }
        },
        {
          id: 'reddit_13',
          text: 'Machine learning is revolutionizing drug discovery. New AI models can predict molecular behavior and identify potential treatments faster than ever.',
          category: 'Science',
          metadata: { subreddit: 'MachineLearning', upvotes: 8765, comments: 432 }
        },
        {
          id: 'reddit_14',
          text: 'The rise of plant-based meat alternatives is fascinating. Impossible Burger and Beyond Meat taste remarkably similar to real meat now.',
          category: 'Food',
          metadata: { subreddit: 'food', upvotes: 5432, comments: 891 }
        },
        {
          id: 'reddit_15',
          text: 'Cryptocurrency adoption in developing countries is growing rapidly as people seek alternatives to unstable local currencies.',
          category: 'Finance',
          metadata: { subreddit: 'cryptocurrency', upvotes: 9876, comments: 1345 }
        }
      ];
      break;

    case 'research_papers':
      sampleData = [
        {
          id: 'paper_1',
          text: 'Attention Is All You Need: A Novel Neural Network Architecture Based Solely on Attention Mechanisms for Machine Translation Tasks',
          category: 'Computer Science',
          metadata: { authors: 'Vaswani et al.', journal: 'NIPS', year: 2017, citations: 58000 }
        },
        {
          id: 'paper_2',
          text: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding and Natural Language Processing Applications',
          category: 'Computer Science',
          metadata: { authors: 'Devlin et al.', journal: 'NAACL', year: 2019, citations: 42000 }
        },
        {
          id: 'paper_3',
          text: 'Deep Reinforcement Learning for Autonomous Vehicle Navigation in Complex Urban Environments with Dynamic Obstacles',
          category: 'Robotics',
          metadata: { authors: 'Chen et al.', journal: 'IEEE Robotics', year: 2023, citations: 156 }
        },
        {
          id: 'paper_4',
          text: 'CRISPR-Cas9 Gene Editing Efficiency Enhancement Through Novel Guide RNA Design and Optimization Strategies',
          category: 'Biology',
          metadata: { authors: 'Garcia et al.', journal: 'Nature Biotechnology', year: 2023, citations: 234 }
        },
        {
          id: 'paper_5',
          text: 'Quantum Error Correction Using Surface Codes: Implementation on Superconducting Quantum Processors',
          category: 'Physics',
          metadata: { authors: 'Kumar et al.', journal: 'Physical Review', year: 2023, citations: 89 }
        },
        {
          id: 'paper_6',
          text: 'Climate Change Impact on Global Agriculture: Machine Learning Models for Crop Yield Prediction Under Extreme Weather',
          category: 'Environmental Science',
          metadata: { authors: 'Johnson et al.', journal: 'Nature Climate Change', year: 2023, citations: 178 }
        },
        {
          id: 'paper_7',
          text: 'Novel Drug Discovery Through Generative AI: Accelerating Pharmaceutical Development Using Large Language Models',
          category: 'Medicine',
          metadata: { authors: 'Williams et al.', journal: 'Cell', year: 2023, citations: 201 }
        },
        {
          id: 'paper_8',
          text: 'Federated Learning for Privacy-Preserving Healthcare Analytics: A Comprehensive Survey and Future Directions',
          category: 'Computer Science',
          metadata: { authors: 'Lee et al.', journal: 'ACM Computing Surveys', year: 2023, citations: 134 }
        },
        {
          id: 'paper_9',
          text: 'Sustainable Energy Storage: Advanced Lithium-Sulfur Battery Technology with Enhanced Cycle Life and Safety',
          category: 'Materials Science',
          metadata: { authors: 'Anderson et al.', journal: 'Advanced Materials', year: 2023, citations: 167 }
        },
        {
          id: 'paper_10',
          text: 'Neural Architecture Search for Efficient Edge Computing: Optimizing Deep Learning Models for Mobile Devices',
          category: 'Computer Science',
          metadata: { authors: 'Zhang et al.', journal: 'ICLR', year: 2023, citations: 245 }
        }
      ];
      break;
  }

  // Simulate processing time
  for (let i = 0; i <= 100; i += 10) {
    await new Promise(resolve => setTimeout(resolve, 50));
    onProgress?.({
      stage: 'processing',
      progress: i,
      current: Math.floor((i / 100) * sampleData.length),
      total: sampleData.length,
      message: `Generating sample data... ${i}%`
    });
  }

  return sampleData;
}