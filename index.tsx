import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
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
  Calendar
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
type FoodItem = {
  id: string;
  name: string;
  calories: number; // per unit
  unit: string;
  quantity: number;
  source: 'ai' | 'user';
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

// --- Components ---

// Fix: Make children optional to prevent TypeScript errors when props are checked before children are injected.
const Card = ({ children, className = "" }: { children?: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

// Fix: Make children optional to prevent TypeScript errors when props are checked before children are injected.
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

const App = () => {
  // State: Stats & Calculator
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [tdee, setTdee] = useState<number>(0);

  // State: Food & Tracking
  const [currentMeals, setCurrentMeals] = useState<FoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [foodLibrary, setFoodLibrary] = useState<LibraryItem[]>([]);
  
  // State: History & Records
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [history, setHistory] = useState<DailyRecord[]>([]);

  // Calculate TDEE on stats change
  useEffect(() => {
    setTdee(calculateTDEE(stats));
  }, [stats]);

  // Load data from LocalStorage
  useEffect(() => {
    const savedLibrary = localStorage.getItem('foodLibrary');
    if (savedLibrary) {
      setFoodLibrary(JSON.parse(savedLibrary));
    }

    const savedHistory = localStorage.getItem('dailyRecords');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }

    const savedStats = localStorage.getItem('userStats');
    if (savedStats) {
      setStats(JSON.parse(savedStats));
    }
  }, []);

  // Save to LocalStorage effects
  useEffect(() => {
    localStorage.setItem('foodLibrary', JSON.stringify(foodLibrary));
  }, [foodLibrary]);

  useEffect(() => {
    localStorage.setItem('dailyRecords', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('userStats', JSON.stringify(stats));
  }, [stats]);


  // AI Estimation Handler
  const handleAiEstimate = async () => {
    if (!searchQuery.trim()) return;

    // Retrieve API Key using the robust helper
    const apiKey = getApiKey();
    if (!apiKey) {
      setAiError('未检测到 API Key，请在 Vercel 环境变量中配置 VITE_API_KEY');
      return;
    }

    setIsAiLoading(true);
    setAiError('');

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const prompt = `请估算食物 "${searchQuery}" 的热量。请返回一个严格的 JSON 对象，格式为：{"name": "食物标准名称", "unit": "单位(如: 碗, 个, 100g)", "calories": 数字(大卡)}。不要包含任何 Markdown 格式。`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (text) {
        const data = JSON.parse(text);
        
        // Add to library
        const newItem: LibraryItem = {
          name: data.name,
          calories: data.calories,
          unit: data.unit
        };
        
        // Update library if not exists
        if (!foodLibrary.some(f => f.name === newItem.name)) {
          setFoodLibrary(prev => [...prev, newItem]);
        }

        // Add to current meals
        handleAddFood(newItem);
        setSearchQuery('');
      }
    } catch (err) {
      console.error(err);
      setAiError('AI 服务暂时不可用，请检查 Key 或重试');
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
      source: 'user'
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
    }).filter(item => item.quantity > 0)); // Optional: remove if 0? keeping it simple > 0
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
      weight: typeof stats.weight === 'number' ? stats.weight : undefined
    };

    setHistory(prev => {
      // Remove existing record for this date if exists
      const filtered = prev.filter(r => r.date !== selectedDate);
      // Add new record and sort
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
  const projectedWeightChange = (calorieDiff * 7) / 7700; // 7700 kcal per kg

  // Filtered food library based on search
  const filteredLibrary = foodLibrary.filter(f => f.name.includes(searchQuery));

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Activity size={24} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">智能热量管家</h1>
          </div>
          <div className="text-sm text-gray-500 hidden sm:block">
            Gemini 2.5 Flash 提供 AI 支持
          </div>
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
            
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <Input 
                  placeholder="输入食物名称 (如: 红烧牛肉面)" 
                  className="pl-10"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAiEstimate()}
                />
              </div>
              <button 
                onClick={handleAiEstimate}
                disabled={isAiLoading || !searchQuery}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors"
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

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[200px]">
              {currentMeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
                  <BookOpen size={48} className="mb-2 opacity-20" />
                  <p>暂无记录，请搜索并添加食物</p>
                </div>
              ) : (
                currentMeals.map((item) => (
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
                ))
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

              {/* SVG Line Chart */}
              <div className="mb-8 p-4 bg-white rounded-lg border border-gray-100">
                 {(() => {
                    // Sort history chronologically for the line chart (Oldest -> Newest)
                    const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
                    
                    if (sortedHistory.length === 0) return <div className="text-center text-gray-400 py-10">暂无数据，请保存记录</div>;

                    // Chart Dimensions & Scales
                    const width = 100; // viewBox units
                    const height = 50; // viewBox units
                    // Y Scale: max value + 20% padding
                    const maxVal = Math.max(...sortedHistory.map(h => h.caloriesIntake), tdee) * 1.2;
                    
                    // Helpers to map data to SVG coordinates
                    const getX = (i: number) => {
                       if (sortedHistory.length <= 1) return 50; // Center if only 1 point
                       return (i / (sortedHistory.length - 1)) * 100;
                    };
                    const getY = (val: number) => height - (val / maxVal) * height;

                    // Generate Line Path
                    const points = sortedHistory.map((d, i) => `${getX(i)},${getY(d.caloriesIntake)}`).join(' ');
                    const tdeeY = getY(tdee);

                    return (
                      <div className="relative w-full aspect-[2/1] sm:aspect-[3/1]">
                         {/* Y-axis Labels (Absolute positioning) */}
                         <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-gray-400 pointer-events-none pr-1 w-8 border-r border-gray-100">
                           <span>{Math.round(maxVal)}</span>
                           <span>{Math.round(maxVal/2)}</span>
                           <span>0</span>
                        </div>

                        {/* Chart Area */}
                        <div className="absolute left-10 right-0 top-0 bottom-6">
                            <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                                {/* Defs for Gradient */}
                                <defs>
                                  <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                  </linearGradient>
                                </defs>

                                {/* Grid Lines */}
                                <line x1="0" y1="0" x2="100" y2="0" stroke="#f3f4f6" strokeWidth="0.5" />
                                <line x1="0" y1={height/2} x2="100" y2={height/2} stroke="#f3f4f6" strokeWidth="0.5" />
                                <line x1="0" y1={height} x2="100" y2={height} stroke="#f3f4f6" strokeWidth="0.5" />

                                {/* TDEE Reference Line (Dashed) */}
                                <line x1="0" y1={tdeeY} x2="100" y2={tdeeY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="3 3" />
                                
                                {/* Area Fill */}
                                <polygon points={`0,${height} ${points} 100,${height}`} fill="url(#chartGradient)" />

                                {/* Main Data Line */}
                                <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

                                {/* Data Points */}
                                {sortedHistory.map((d, i) => (
                                  <circle 
                                    key={i} 
                                    cx={getX(i)} 
                                    cy={getY(d.caloriesIntake)} 
                                    r="3" 
                                    className="fill-blue-600 stroke-white stroke-2 hover:r-4 transition-all cursor-pointer"
                                    vectorEffect="non-scaling-stroke"
                                  >
                                    <title>{d.date}: {d.caloriesIntake} kcal</title>
                                  </circle>
                                ))}
                            </svg>

                            {/* TDEE Label */}
                            <div className="absolute right-0 bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded shadow-sm transform -translate-y-1/2" style={{top: `${(tdeeY/height)*100}%`}}>
                               TDEE: {tdee}
                            </div>
                        </div>

                        {/* X-axis Labels */}
                        <div className="absolute left-10 right-0 bottom-0 h-6 flex justify-between items-center text-[10px] text-gray-500">
                           {sortedHistory.map((d, i) => (
                             <div key={i} style={{ width: `${100/sortedHistory.length}%`, textAlign: 'center' }}>
                               {d.date.slice(5)} {/* Show MM-DD */}
                             </div>
                           ))}
                        </div>
                      </div>
                    )
                 })()}
              </div>

              {/* History Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">日期</th>
                      <th className="py-3 px-4">摄入 (kcal)</th>
                      <th className="py-3 px-4">目标 (kcal)</th>
                      <th className="py-3 px-4">差值</th>
                      <th className="py-3 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((record, index) => {
                       const diff = record.caloriesIntake - record.caloriesBurned;
                       return (
                        <tr key={index} className="hover:bg-gray-50/50">
                          <td className="py-3 px-4 font-medium text-gray-800">{record.date}</td>
                          <td className="py-3 px-4">{record.caloriesIntake}</td>
                          <td className="py-3 px-4 text-gray-500">{record.caloriesBurned}</td>
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