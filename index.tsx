import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
// Removed GoogleGenAI import
import { 
  Activity, 
  Trash2, 
  Utensils, 
  Search, 
  Brain, 
  Scale, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Plus,
  Info,
  Loader2,
  Save,
  BarChart3,
  History,
  BookOpen,
  Calendar,
  Eye,
  ScrollText,
  Sunrise,
  Sun,
  Moon,
  Settings,
  X,
  Zap
} from 'lucide-react';

// --- Safe API Key Retrieval ---
const getApiKey = () => {
  // Check for common environment variable patterns safely
  
  // 1. Check for Vite style (most likely for Vercel + Vite)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  // 2. Check for process.env (Standard Node/Next.js)
  try {
    if (typeof process !== 'undefined' && process.env) {
      // Check VITE_ prefix in process.env just in case
      if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY;
      // Check standard name
      if (process.env.API_KEY) return process.env.API_KEY;
    }
  } catch (e) {}

  return ''; // Return empty string if not found, UI will handle warning
};

// --- Types ---
type MealCategory = 'breakfast' | 'lunch' | 'dinner';

type FoodItem = {
  id: string;
  name: string;
  calories: number; // per unit
  unit: string;
  quantity: number;
  source: 'ai' | 'user';
  category: MealCategory; // Added category
};

type LibraryItem = {
  name: string;
  calories: number;
  unit: string;
};

type UserStats = {
  age: number | '';
  gender: 'male' | 'female';
  weight: number | ''; // kg
  height: number | ''; // cm
  activityLevel: number;
  goal: 'lose' | 'maintain' | 'gain';
};

type DailyRecord = {
  date: string; // YYYY-MM-DD
  caloriesIntake: number;
  caloriesBurned: number; // TDEE
  weight?: number;
  meals: FoodItem[]; // Saved meals for that day
};

type AIConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

// --- Constants ---
const ACTIVITY_LEVELS = [
  { value: 1.2, label: '久坐不动 (办公室工作，极少运动)' },
  { value: 1.375, label: '轻度活动 (每周运动 1-3 次)' },
  { value: 1.55, label: '中度活动 (每周运动 3-5 次)' },
  { value: 1.725, label: '高度活动 (每周运动 6-7 次)' },
  { value: 1.9, label: '极度活动 (从事体力劳动或专业训练)' },
];

const INITIAL_STATS: UserStats = {
  age: 30,
  gender: 'male',
  weight: 70,
  height: 175,
  activityLevel: 1.375,
  goal: 'lose',
};

const MEAL_CONFIG = {
  breakfast: { label: '早餐', icon: Sunrise, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  lunch: { label: '午餐', icon: Sun, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  dinner: { label: '晚餐', icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' }
};

// Updated Default Configuration to use Volcengine (DeepSeek V3) as requested
const DEFAULT_AI_CONFIG: AIConfig = {
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
  apiKey: "09f02a14-bc45-43f7-80ba-136d8cad1011", 
  model: "deepseek-v3-1-terminus"
};

// --- Helper Functions ---
const calculateBMR = (stats: UserStats): number => {
  if (!stats.weight || !stats.height || !stats.age) return 0;
  // Mifflin-St Jeor Equation
  const s = stats.gender === 'male' ? 5 : -161;
  return (10 * stats.weight) + (6.25 * stats.height) - (5 * stats.age) + s;
};

const calculateTDEE = (stats: UserStats): number => {
  const bmr = calculateBMR(stats);
  return Math.round(bmr * stats.activityLevel);
};

const getTodayDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTimeBasedMealCategory = (): MealCategory => {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
};

// Simple smoothing function for SVG path (Catmull-Rom spline to Bezier conversion)
const getSmoothPath = (points: {x: number, y: number}[]) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

// --- API Helpers ---

// Generic OpenAI-compatible client
const callAI = async (prompt: string, config: AIConfig) => {
  // Fallback to Env key if config key is empty
  const finalApiKey = config.apiKey || getApiKey();
  const finalUrl = config.baseUrl || DEFAULT_AI_CONFIG.baseUrl;
  const finalModel = config.model || DEFAULT_AI_CONFIG.model;

  if (!finalApiKey) {
     throw new Error("Missing API Key. Please configure it in settings or environment variables.");
  }

  try {
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${finalApiKey}`
      },
      body: JSON.stringify({
        model: finalModel,
        messages: [
          {
            role: "system",
            content: "You are a professional nutritionist API. You strictly output valid JSON objects only. Do not output markdown code blocks. Do not output explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false,
        // response_format: { type: 'json_object' } // Removed to maximize compatibility with non-DeepSeek/OpenAI providers
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return content;
  } catch (error) {
    console.error("AI Call Failed:", error);
    throw error;
  }
};

// --- Components ---

const Card = ({ children, className = "" }: { children?: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

const Label = ({ children }: { children?: React.ReactNode }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
    {children}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white"
  />
);

// Settings Modal Component
const SettingsModal = ({ 
  isOpen, 
  onClose, 
  config, 
  onSave 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  config: AIConfig, 
  onSave: (c: AIConfig) => void 
}) => {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (!isOpen) return null;

  const applyPreset = (type: 'deepseek' | 'volcengine' | 'moonshot') => {
    if (type === 'deepseek') {
      setLocalConfig({
        ...localConfig,
        baseUrl: "https://api.deepseek.com/chat/completions",
        model: "deepseek-chat"
      });
    } else if (type === 'volcengine') {
      setLocalConfig({
        ...localConfig,
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        apiKey: "09f02a14-bc45-43f7-80ba-136d8cad1011",
        model: "deepseek-v3-1-terminus"
      });
    } else if (type === 'moonshot') {
       setLocalConfig({
        ...localConfig,
        baseUrl: "https://api.moonshot.cn/v1/chat/completions",
        model: "moonshot-v1-8k"
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Settings size={18} />
            AI 服务配置
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-xs leading-relaxed">
             此处支持所有兼容 OpenAI 格式的 API（如 DeepSeek、火山引擎、Kimi 等）。请确保 Base URL 填写完整的接口地址。
          </div>

          <div>
             <Label>快速预设 (Presets)</Label>
             <div className="flex gap-2 mt-1">
                <button 
                  onClick={() => applyPreset('deepseek')}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 flex items-center gap-1"
                >
                   <Zap size={12} className="text-blue-500" /> DeepSeek
                </button>
                <button 
                  onClick={() => applyPreset('volcengine')}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 flex items-center gap-1 border border-red-200 bg-red-50"
                >
                   <Zap size={12} className="text-red-500" /> 火山引擎 (默认)
                </button>
                 <button 
                  onClick={() => applyPreset('moonshot')}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-700 flex items-center gap-1"
                >
                   <Zap size={12} className="text-purple-500" /> Kimi
                </button>
             </div>
          </div>

          <div>
            <Label>API 地址 (Base URL)</Label>
            <Input 
              value={localConfig.baseUrl} 
              onChange={e => setLocalConfig({...localConfig, baseUrl: e.target.value})}
              placeholder="https://..."
            />
            <p className="text-[10px] text-gray-400 mt-1">
              注意: 火山引擎等服务通常需要在基础域名后加上 <span className="font-mono bg-gray-100 px-1 rounded">/chat/completions</span>
            </p>
          </div>
          <div>
            <Label>API Key</Label>
            <Input 
              type="password"
              value={localConfig.apiKey} 
              onChange={e => setLocalConfig({...localConfig, apiKey: e.target.value})}
              placeholder="留空则使用环境变量中的 Key"
            />
          </div>
          <div>
            <Label>模型名称 (Model)</Label>
            <Input 
              value={localConfig.model} 
              onChange={e => setLocalConfig({...localConfig, model: e.target.value})}
              placeholder="例如: deepseek-chat"
            />
          </div>
        </div>
        <div className="p-4 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg">取消</button>
          <button 
            onClick={() => {
              onSave(localConfig);
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 rounded-lg"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  // State: Stats & Calculator
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [tdee, setTdee] = useState<number>(0);

  // State: Food & Tracking
  const [activeCategory, setActiveCategory] = useState<MealCategory>(getTimeBasedMealCategory());
  const [currentMeals, setCurrentMeals] = useState<FoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [foodLibrary, setFoodLibrary] = useState<LibraryItem[]>([]);
  
  // State: History & Records
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [history, setHistory] = useState<DailyRecord[]>([]);
  
  // State: UI Interactions
  const [hoveredChartPoint, setHoveredChartPoint] = useState<{x: number, y: number, value: number, date: string} | null>(null);
  const [hoveredMealRow, setHoveredMealRow] = useState<string | null>(null); // Date string as ID
  
  // State: AI Config
  const [showSettings, setShowSettings] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);

  // Calculate TDEE on stats change
  useEffect(() => {
    setTdee(calculateTDEE(stats));
  }, [stats]);

  // Load data from LocalStorage
  useEffect(() => {
    const savedLibrary = localStorage.getItem('foodLibrary');
    if (savedLibrary) setFoodLibrary(JSON.parse(savedLibrary));

    const savedHistory = localStorage.getItem('dailyRecords');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedStats = localStorage.getItem('userStats');
    if (savedStats) setStats(JSON.parse(savedStats));
    
    const savedMeals = localStorage.getItem('currentMeals');
    if (savedMeals) {
        const parsed = JSON.parse(savedMeals);
        const migrated = parsed.map((m: any) => ({
            ...m,
            category: m.category || 'lunch' 
        }));
        setCurrentMeals(migrated);
    }
    
    // We prioritize the updated default config if user hasn't explicitly set one, 
    // but to be safe we respect local storage if it exists, OR we can reset it if it looks like the old default.
    // For this update request, let's load it but if it has no key/standard default, use the new default.
    const savedAiConfig = localStorage.getItem('aiConfig');
    if (savedAiConfig) {
       const parsed = JSON.parse(savedAiConfig);
       // If the loaded config is empty or the old default, we overwrite it with the new default
       if (!parsed.apiKey && parsed.baseUrl.includes('deepseek.com')) {
          setAiConfig(DEFAULT_AI_CONFIG);
       } else {
          setAiConfig(parsed);
       }
    }
  }, []);

  // Save to LocalStorage effects
  useEffect(() => localStorage.setItem('foodLibrary', JSON.stringify(foodLibrary)), [foodLibrary]);
  useEffect(() => localStorage.setItem('dailyRecords', JSON.stringify(history)), [history]);
  useEffect(() => localStorage.setItem('userStats', JSON.stringify(stats)), [stats]);
  useEffect(() => localStorage.setItem('currentMeals', JSON.stringify(currentMeals)), [currentMeals]);
  useEffect(() => localStorage.setItem('aiConfig', JSON.stringify(aiConfig)), [aiConfig]);


  // AI Estimation Handler
  const handleAiEstimate = async () => {
    if (!searchQuery.trim()) return;

    setIsAiLoading(true);
    setAiError('');

    try {
      const prompt = `请估算食物 "${searchQuery}" 的热量。请返回一个严格的 JSON 对象，格式为：{"name": "食物标准名称", "unit": "单位(如: 碗, 个, 100g)", "calories": 数字(大卡)}。不要包含任何 Markdown 格式或解释文字。`;
      
      const jsonString = await callAI(prompt, aiConfig);

      if (jsonString) {
        const cleanJson = jsonString.replace(/```json\n?|```/g, '').trim();
        const data = JSON.parse(cleanJson);
        
        const newItem: LibraryItem = {
          name: data.name,
          calories: data.calories,
          unit: data.unit
        };
        
        if (!foodLibrary.some(f => f.name === newItem.name)) {
          setFoodLibrary(prev => [...prev, newItem]);
        }

        handleAddFood(newItem);
        setSearchQuery('');
      }
    } catch (err: any) {
      console.error(err);
      if (err.message && (err.message.includes('401') || err.message.includes('403'))) {
         setAiError('API Key 无效或被拒绝，请点击右上角⚙️检查设置');
      } else {
         setAiError(`AI 请求失败: ${err.message}`);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAddFood = (item: LibraryItem) => {
    const newFood: FoodItem = {
      id: Date.now().toString(),
      name: item.name,
      calories: item.calories,
      unit: item.unit,
      quantity: 1,
      source: 'user',
      category: activeCategory
    };
    setCurrentMeals(prev => [...prev, newFood]);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCurrentMeals(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = Math.max(0.5, item.quantity + delta);
        return { ...item, quantity: newQ };
      }
      return item;
    }).filter(item => item.quantity > 0)); 
  };

  const removeFood = (id: string) => {
    setCurrentMeals(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveRecord = () => {
    const totalIntake = currentMeals.reduce((sum, item) => sum + (item.calories * item.quantity), 0);
    
    const newRecord: DailyRecord = {
      date: selectedDate,
      caloriesIntake: Math.round(totalIntake),
      caloriesBurned: tdee,
      weight: typeof stats.weight === 'number' ? stats.weight : undefined,
      meals: [...currentMeals] 
    };

    setHistory(prev => {
      const filtered = prev.filter(r => r.date !== selectedDate);
      return [...filtered, newRecord].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    
    alert(`已保存 ${selectedDate} 的记录！`);
  };

  const handleDeleteRecord = (dateToDelete: string) => {
    if (confirm(`确定要删除 ${dateToDelete} 的记录吗？`)) {
      setHistory(prev => prev.filter(r => r.date !== dateToDelete));
    }
  };

  const totalCalories = currentMeals.reduce((sum, item) => sum + (item.calories * item.quantity), 0);
  const calorieDiff = totalCalories - tdee;
  const projectedWeightChange = (calorieDiff * 7) / 7700; 

  const filteredLibrary = foodLibrary.filter(f => f.name.includes(searchQuery));

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        config={aiConfig}
        onSave={setAiConfig}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Activity size={24} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">智能热量管家</h1>
          </div>
          <button 
             onClick={() => setShowSettings(true)}
             className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
             title="AI 设置"
          >
             <Settings size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        
        {/* Section 1: User Stats & TDEE */}
        <section className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Scale size={20} className="text-blue-500" />
              个人参数配置
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>年龄</Label>
                <Input 
                  type="number" 
                  value={stats.age} 
                  onChange={e => setStats({...stats, age: Number(e.target.value)})}
                  placeholder="30"
                />
              </div>
              <div>
                <Label>性别</Label>
                <Select 
                  value={stats.gender} 
                  onChange={e => setStats({...stats, gender: e.target.value as 'male' | 'female'})}
                >
                  <option value="male">男</option>
                  <option value="female">女</option>
                </Select>
              </div>
              <div>
                <Label>体重 (kg)</Label>
                <Input 
                  type="number" 
                  value={stats.weight} 
                  onChange={e => setStats({...stats, weight: Number(e.target.value)})}
                  placeholder="70"
                />
              </div>
              <div>
                <Label>身高 (cm)</Label>
                <Input 
                  type="number" 
                  value={stats.height} 
                  onChange={e => setStats({...stats, height: Number(e.target.value)})}
                  placeholder="175"
                />
              </div>
              <div className="col-span-2">
                <Label>日常活动水平</Label>
                <Select 
                  value={stats.activityLevel} 
                  onChange={e => setStats({...stats, activityLevel: Number(e.target.value)})}
                >
                  {ACTIVITY_LEVELS.map(lvl => (
                    <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                  ))}
                </Select>
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white flex flex-col justify-center items-center text-center">
            <div className="mb-2 opacity-90">每日总消耗 (TDEE)</div>
            <div className="text-4xl font-bold mb-1">{tdee}</div>
            <div className="text-sm opacity-80">千卡/天</div>
            <div className="mt-6 pt-6 border-t border-white/20 w-full">
              <div className="text-sm opacity-90 mb-1">基础代谢 (BMR)</div>
              <div className="font-semibold text-lg">{Math.round(calculateBMR(stats))} <span className="text-sm font-normal">千卡</span></div>
            </div>
          </Card>
        </section>

        {/* Section 2: Food Tracking */}
        <section className="grid md:grid-cols-2 gap-6">
          {/* Left: Search & Add */}
          <Card className="flex flex-col h-full">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Utensils size={20} className="text-green-500" />
              今日饮食记录
            </h2>

            {/* Meal Category Selector */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
              {(Object.keys(MEAL_CONFIG) as MealCategory[]).map((cat) => {
                const config = MEAL_CONFIG[cat];
                const Icon = config.icon;
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
                      isActive 
                        ? 'bg-white text-gray-800 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={16} className={isActive ? config.color : ''} />
                    {config.label}
                  </button>
                );
              })}
            </div>
            
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <Input 
                  placeholder={`添加${MEAL_CONFIG[activeCategory].label}食物 (如: 牛奶, 三明治)`} 
                  className="pl-10"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAiEstimate()}
                />
              </div>
              <button 
                onClick={handleAiEstimate}
                disabled={isAiLoading || !searchQuery}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors shrink-0"
              >
                {isAiLoading ? <Loader2 className="animate-spin" size={18} /> : <Brain size={18} />}
                <span className="hidden sm:inline">AI 估算</span>
              </button>
            </div>

            {aiError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <Info size={16} /> {aiError}
              </div>
            )}

            {/* Local Library Suggestions */}
            {searchQuery && filteredLibrary.length > 0 && (
              <div className="mb-4 border border-gray-100 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 font-medium">您的食物库</div>
                {filteredLibrary.map((item, idx) => (
                  <button 
                    key={idx}
                    onClick={() => {
                      handleAddFood(item);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex justify-between items-center text-sm border-b border-gray-50 last:border-0"
                  >
                    <span>{item.name}</span>
                    <span className="text-gray-500">{item.calories} 大卡/{item.unit}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1 min-h-[200px]">
              {currentMeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                  <BookOpen size={48} className="mb-2 opacity-20" />
                  <p>暂无记录，请选择餐点并添加食物</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(['breakfast', 'lunch', 'dinner'] as MealCategory[]).map(cat => {
                    const mealsInCat = currentMeals.filter(m => (m.category || 'lunch') === cat);
                    if (mealsInCat.length === 0) return null;
                    const config = MEAL_CONFIG[cat];
                    const CatIcon = config.icon;

                    return (
                      <div key={cat} className="space-y-2">
                        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${config.color} border-b ${config.border} pb-1`}>
                          <CatIcon size={14} />
                          {config.label}
                        </div>
                        {mealsInCat.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group">
                            <div>
                              <div className="font-medium text-gray-800">{item.name}</div>
                              <div className="text-xs text-gray-500">{item.calories} 大卡 / {item.unit}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 bg-white rounded-md border border-gray-200 px-1 py-1">
                                <button onClick={() => updateQuantity(item.id, -0.5)} className="p-1 hover:bg-gray-100 rounded text-gray-600"><Minus size={14} /></button>
                                <span className="text-sm w-8 text-center font-medium">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, 0.5)} className="p-1 hover:bg-gray-100 rounded text-gray-600"><Plus size={14} /></button>
                              </div>
                              <button onClick={() => removeFood(item.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
               <div className="flex items-center gap-2">
                 <label className="text-sm font-medium text-gray-600">日期:</label>
                 <input 
                  type="date" 
                  value={selectedDate} 
                  onChange={e => setSelectedDate(e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-blue-500"
                />
               </div>
               <button 
                onClick={handleSaveRecord}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
               >
                 <Save size={16} /> 保存记录
               </button>
            </div>
          </Card>

          {/* Right: Real-time Analysis */}
          <Card className="flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <Brain size={20} className="text-purple-500" />
                实时预测
              </h2>

              <div className="space-y-6">
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between mb-2 text-sm font-medium">
                    <span className="text-gray-600">摄入 vs 消耗</span>
                    <span className={`${calorieDiff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {totalCalories.toFixed(0)} / {tdee}
                    </span>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${calorieDiff > 0 ? 'bg-red-400' : 'bg-green-400'}`}
                      style={{ width: `${Math.min((totalCalories / tdee) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-gray-500 text-right">
                    {calorieDiff > 0 ? `超标 ${Math.round(calorieDiff)} 大卡` : `剩余 ${Math.round(Math.abs(calorieDiff))} 大卡`}
                  </div>
                </div>

                {/* Prediction Card */}
                <div className={`p-4 rounded-xl border ${calorieDiff > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {calorieDiff > 0 ? (
                      <TrendingUp className="text-red-500" />
                    ) : (
                      <TrendingDown className="text-green-500" />
                    )}
                    <span className="font-semibold text-gray-800">一周体重预测</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    如果每天保持当前饮食，预计一周后体重将
                    <span className={`font-bold mx-1 ${calorieDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {calorieDiff > 0 ? '增加' : '减少'} {Math.abs(projectedWeightChange).toFixed(2)} kg
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-blue-50 p-4 rounded-lg text-sm text-blue-700 flex gap-3">
              <Info className="shrink-0 mt-0.5" size={16} />
              <p>预测基于 7700大卡/公斤 的理论模型。实际变化受水分、激素和代谢适应影响。</p>
            </div>
          </Card>
        </section>

        {/* Section 3: History Chart & Log */}
        {history.length > 0 && (
          <section className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-3">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <History size={20} className="text-orange-500" />
                历史趋势
              </h2>

              {/* Improved SVG Smooth Line Chart */}
              <div className="mb-8 p-4 bg-white rounded-lg border border-gray-100">
                 {(() => {
                    const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-10);
                    
                    if (sortedHistory.length === 0) return <div className="text-center text-gray-400 py-10">暂无数据，请保存记录</div>;

                    // Chart Dimensions & Scales
                    const width = 800; 
                    const height = 300; 
                    const padding = 40;
                    
                    const maxVal = Math.max(...sortedHistory.map(h => h.caloriesIntake), tdee) * 1.15;
                    
                    const getX = (i: number) => {
                       if (sortedHistory.length <= 1) return width / 2;
                       return padding + (i / (sortedHistory.length - 1)) * (width - padding * 2);
                    };
                    const getY = (val: number) => height - padding - (val / maxVal) * (height - padding * 2);

                    const pointsArr = sortedHistory.map((d, i) => ({x: getX(i), y: getY(d.caloriesIntake)}));
                    const smoothPath = getSmoothPath(pointsArr);
                    
                    // Close the path for area fill
                    const areaPath = pointsArr.length > 0 
                      ? `${smoothPath} L ${pointsArr[pointsArr.length-1].x} ${height - padding} L ${pointsArr[0].x} ${height - padding} Z`
                      : '';

                    const tdeeY = getY(tdee);

                    return (
                      <div className="relative w-full aspect-[2/1] sm:aspect-[3/1] max-h-[300px]">
                        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
                            <defs>
                              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                              </linearGradient>
                            </defs>

                            {/* Grid Lines Y */}
                            {[0, 0.5, 1].map(ratio => {
                                const y = height - padding - ratio * (height - padding * 2);
                                return (
                                  <g key={ratio}>
                                    <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                                    <text x={padding - 10} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                                      {Math.round(ratio * maxVal)}
                                    </text>
                                  </g>
                                );
                            })}

                            {/* TDEE Line */}
                            <line x1={padding} y1={tdeeY} x2={width - padding} y2={tdeeY} stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 5" />
                            <text x={width - padding + 5} y={tdeeY + 4} fontSize="10" fill="#64748b" textAnchor="start">TDEE</text>

                            {/* Smooth Area & Line */}
                            <path d={areaPath} fill="url(#chartGradient)" />
                            <path d={smoothPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                            {/* Interactive Data Points */}
                            {pointsArr.map((p, i) => (
                              <g 
                                key={i} 
                                onMouseEnter={() => setHoveredChartPoint({
                                  x: p.x, 
                                  y: p.y, 
                                  value: sortedHistory[i].caloriesIntake, 
                                  date: sortedHistory[i].date
                                })}
                                onMouseLeave={() => setHoveredChartPoint(null)}
                                className="cursor-pointer"
                              >
                                {/* Invisible larger target for easier hovering */}
                                <circle cx={p.x} cy={p.y} r="8" fill="transparent" /> 
                                <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#2563eb" strokeWidth="2" className="transition-all hover:r-5" />
                              </g>
                            ))}

                            {/* X-Axis Labels */}
                            {sortedHistory.map((d, i) => (
                               <text key={i} x={getX(i)} y={height - 10} textAnchor="middle" fontSize="10" fill="#6b7280">
                                 {d.date.slice(5)}
                               </text>
                            ))}
                        </svg>

                        {/* Custom Tooltip Overlay */}
                        {hoveredChartPoint && (
                          <div 
                            className="absolute bg-gray-900 text-white text-xs rounded-lg py-1 px-2 pointer-events-none shadow-lg transform -translate-x-1/2 -translate-y-full mb-2 z-10 whitespace-nowrap"
                            style={{ 
                              left: `${(hoveredChartPoint.x / width) * 100}%`, 
                              top: `${(hoveredChartPoint.y / height) * 100}%`,
                              marginTop: '-10px'
                            }}
                          >
                             <div className="font-semibold">{hoveredChartPoint.date}</div>
                             <div>摄入: {hoveredChartPoint.value} kcal</div>
                             <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        )}
                      </div>
                    )
                 })()}
              </div>

              {/* History Table with Details */}
              <div className="overflow-x-visible">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">日期</th>
                      <th className="py-3 px-4">饮食详情</th>
                      <th className="py-3 px-4">摄入 (kcal)</th>
                      <th className="py-3 px-4">差值</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((record, index) => {
                       const diff = record.caloriesIntake - record.caloriesBurned;
                       return (
                        <tr key={index} className="hover:bg-gray-50/50 group relative">
                          <td className="py-3 px-4 font-medium text-gray-800">{record.date}</td>
                          <td className="py-3 px-4 relative">
                             {/* Meal Details Popover Trigger */}
                             <div 
                               className="inline-block"
                               onMouseEnter={() => setHoveredMealRow(record.date)}
                               onMouseLeave={() => setHoveredMealRow(null)}
                             >
                                <button className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-full transition-colors">
                                  <ScrollText size={18} />
                                </button>

                                {/* Popover Content */}
                                {hoveredMealRow === record.date && (
                                  <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-100 z-20 p-3 animate-in fade-in zoom-in-95 duration-100 origin-top-left max-h-64 overflow-y-auto custom-scrollbar">
                                     <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">当日菜单</h4>
                                     
                                     {record.meals && record.meals.length > 0 ? (
                                        <div className="space-y-3">
                                          {(['breakfast', 'lunch', 'dinner'] as MealCategory[]).map(cat => {
                                            const mealsInCat = record.meals.filter(m => (m.category || 'lunch') === cat);
                                            if (mealsInCat.length === 0) return null;
                                            const config = MEAL_CONFIG[cat];
                                            
                                            return (
                                              <div key={cat}>
                                                <div className={`text-[10px] font-bold ${config.color} uppercase mb-1`}>{config.label}</div>
                                                <ul className="space-y-1">
                                                  {mealsInCat.map((meal, idx) => (
                                                    <li key={idx} className="text-xs flex justify-between items-start">
                                                        <span className="text-gray-700 w-32 truncate">{meal.name} <span className="text-gray-400 text-[10px]">x{meal.quantity}</span></span>
                                                        <span className="text-gray-500 text-[10px]">{Math.round(meal.calories * meal.quantity)}</span>
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            )
                                          })}
                                        </div>
                                     ) : (
                                       <div className="text-xs text-gray-400 italic py-2 text-center">无详细食物记录</div>
                                     )}
                                     <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                                       <span className="text-xs text-gray-500 font-medium">总热量</span>
                                       <span className="text-sm font-bold text-blue-600">{record.caloriesIntake}</span>
                                     </div>
                                  </div>
                                )}
                             </div>
                          </td>
                          <td className="py-3 px-4">{record.caloriesIntake}</td>
                          <td className={`py-3 px-4 font-medium ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {diff > 0 ? '+' : ''}{diff}
                          </td>
                          <td className="py-3 px-4 text-right">
                             <button 
                               onClick={() => handleDeleteRecord(record.date)}
                               className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                             >
                               <Trash2 size={16} />
                             </button>
                          </td>
                        </tr>
                       )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}

      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);