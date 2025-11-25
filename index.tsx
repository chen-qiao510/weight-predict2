
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
  History
} from 'lucide-react';

// --- Configuration ---
const PREDEFINED_FOODS = [
  { id: '1', name: '生煎 (Pan-fried Bun)', unit: '个', calories: 65 },
  { id: '2', name: '面条 (Noodles)', unit: '碗', calories: 350 },
  { id: '3', name: '酸奶 (Yogurt)', unit: '碗/杯', calories: 120 },
  { id: '4', name: '可乐 (Cola)', unit: '100ml', calories: 42 },
  { id: '5', name: '麦片 (Oatmeal - 干重)', unit: '克', calories: 3.7 }, // 370kcal per 100g -> 3.7 per g
  { id: '6', name: '炒饭 (Fried Rice)', unit: '碗', calories: 450 },
  { id: '7', name: '米饭 (White Rice)', unit: '碗', calories: 200 },
  { id: '8', name: '煮鸡蛋 (Boiled Egg)', unit: '个', calories: 70 },
  { id: '9', name: '苹果 (Apple)', unit: '个', calories: 95 },
  { id: '10', name: '汉堡 (Hamburger)', unit: '个', calories: 500 },
];

// --- Types ---
type Gender = 'male' | 'female';
type Goal = 'lose' | 'maintain' | 'gain';

interface UserStats {
  age: number;
  gender: Gender;
  weight: number; // kg
  height: number; // cm
  activityLevel: number;
  goal: Goal;
}

interface FoodItem {
  id: string;
  name: string;
  unit: string;
  calories: number;
  isCustom?: boolean;
}

interface MealEntry {
  id: string;
  food: FoodItem;
  quantity: number;
}

interface MealLog {
  lunch: MealEntry[];
  dinner: MealEntry[];
  [key: string]: MealEntry[];
}

interface DailyRecord {
  date: string; // YYYY-MM-DD
  calories: number;
  tdee: number;
  weight: number;
}

// --- Helper Components ---

const Card = ({ children, className = '' }: { children?: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}>
    {children}
  </div>
);

const Label = ({ children, icon: Icon }: { children?: React.ReactNode, icon?: any }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
    {Icon && <Icon className="w-4 h-4 text-blue-500" />}
    {children}
  </label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    {...props} 
    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none" 
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative">
    <select 
      {...props} 
      className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none appearance-none bg-white" 
    />
    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
    </div>
  </div>
);

// --- Custom Chart Component (SVG) ---
const HistoryChart = ({ data }: { data: DailyRecord[] }) => {
  if (!data || data.length === 0) return <div className="text-center text-gray-400 py-10">暂无历史数据，请保存今天的记录</div>;

  // Configuration
  const height = 200;
  const width = 100; // percent
  const padding = 20;
  
  // Get last 7 days or all data
  const chartData = data.slice(-7); 
  
  const maxVal = Math.max(...chartData.map(d => Math.max(d.calories, d.tdee)), 2000) * 1.1;

  return (
    <div className="w-full h-64 flex flex-col">
      <div className="flex-1 relative">
        <svg className="w-full h-full" viewBox={`0 0 ${chartData.length * 60} ${height + padding * 2}`}>
          {/* Grid lines */}
          <line x1="0" y1={height} x2="100%" y2={height} stroke="#e5e7eb" strokeWidth="1" />
          <line x1="0" y1="0" x2="100%" y2="0" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
          
          {chartData.map((record, i) => {
            const x = i * 60 + 30;
            const barHeight = (record.calories / maxVal) * height;
            const tdeeY = height - (record.tdee / maxVal) * height;
            const isOver = record.calories > record.tdee;
            
            return (
              <g key={record.date}>
                {/* TDEE Line Segment */}
                {i > 0 && (
                   <line 
                    x1={(i - 1) * 60 + 30} 
                    y1={height - (chartData[i-1].tdee / maxVal) * height}
                    x2={x}
                    y2={tdeeY}
                    stroke="#9CA3AF"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                   />
                )}
                
                {/* TDEE Point */}
                <circle cx={x} cy={tdeeY} r="3" fill="#9CA3AF" />

                {/* Calorie Bar */}
                <rect 
                  x={x - 15} 
                  y={height - barHeight} 
                  width="30" 
                  height={barHeight} 
                  rx="4"
                  fill={isOver ? "#F87171" : "#4ADE80"} 
                  className="transition-all duration-500 hover:opacity-80"
                />

                {/* Labels */}
                <text x={x} y={height - barHeight - 5} textAnchor="middle" fontSize="10" fill="#6B7280">
                  {record.calories}
                </text>
                
                <text x={x} y={height + 15} textAnchor="middle" fontSize="10" fill="#374151">
                  {record.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex justify-center gap-6 mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded"></div> 消耗小于 TDEE (减脂)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-400 rounded"></div> 消耗大于 TDEE (增重)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-gray-400 border-t border-dashed"></div> TDEE 参考线
        </div>
      </div>
    </div>
  );
};

// --- Main Application ---

const App = () => {
  // --- State ---
  const [stats, setStats] = useState<UserStats>({
    age: 30,
    gender: 'male',
    weight: 70,
    height: 175,
    activityLevel: 1.2,
    goal: 'lose'
  });

  const [tdee, setTdee] = useState<number>(0);
  const [bmr, setBmr] = useState<number>(0);

  const [mealLog, setMealLog] = useState<MealLog>({
    lunch: [],
    dinner: []
  });

  const [foodSearch, setFoodSearch] = useState('');
  const [selectedMeal, setSelectedMeal] = useState<'lunch' | 'dinner'>('lunch');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);
  
  // History State
  const [history, setHistory] = useState<DailyRecord[]>([]);

  // --- Effects ---

  // Load History from LocalStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('calorie_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Calculate BMR and TDEE whenever stats change
  useEffect(() => {
    // Mifflin-St Jeor Equation
    let calculatedBmr = (10 * stats.weight) + (6.25 * stats.height) - (5 * stats.age);
    if (stats.gender === 'male') {
      calculatedBmr += 5;
    } else {
      calculatedBmr -= 161;
    }
    
    setBmr(Math.round(calculatedBmr));
    setTdee(Math.round(calculatedBmr * stats.activityLevel));
  }, [stats]);

  // --- Handlers ---

  const handleStatChange = (field: keyof UserStats, value: any) => {
    setStats(prev => ({ ...prev, [field]: value }));
  };

  const addFood = (food: FoodItem) => {
    const newEntry: MealEntry = {
      id: Math.random().toString(36).substr(2, 9),
      food,
      quantity: 1 // default 1 unit
    };
    
    setMealLog(prev => ({
      ...prev,
      [selectedMeal]: [...prev[selectedMeal], newEntry]
    }));
    setFoodSearch('');
  };

  const removeEntry = (meal: 'lunch' | 'dinner', id: string) => {
    setMealLog(prev => ({
      ...prev,
      [meal]: prev[meal].filter(item => item.id !== id)
    }));
  };

  const updateQuantity = (meal: 'lunch' | 'dinner', id: string, newQty: number) => {
    if (newQty < 0) return;
    setMealLog(prev => ({
      ...prev,
      [meal]: prev[meal].map(item => item.id === id ? { ...item, quantity: newQty } : item)
    }));
  };

  // --- AI Feature ---
  const estimateCaloriesWithAI = async () => {
    if (!foodSearch.trim()) return;
    setIsAiLoading(true);

    try {
      // @ts-ignore
      const apiKey = process.env.API_KEY || process.env.VITE_API_KEY || process.env.NEXT_PUBLIC_API_KEY || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY);
      
      if (!apiKey) {
        alert("API Key not found. Please set VITE_API_KEY or API_KEY in your Vercel Environment Variables.");
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        Estimate the calories for the food item: "${foodSearch}".
        Return ONLY a standard JSON object (no markdown formatting) with the following structure:
        {
          "name": "Standardized Name",
          "unit": "standard serving unit (e.g. bowl, piece, 100g, ml)",
          "calories": number (estimated calories per unit)
        }
        Use chinese for name and unit.
      `;

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
        const newFood: FoodItem = {
          id: `ai-${Date.now()}`,
          name: data.name,
          unit: data.unit,
          calories: data.calories,
          isCustom: true
        };
        setCustomFoods(prev => [...prev, newFood]);
        addFood(newFood);
      }
    } catch (error) {
      console.error("AI Error:", error);
      alert("AI 估算失败，请检查 API Key 或稍后重试。");
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- Calculations ---

  const calculateMealCalories = (entries: MealEntry[]) => {
    return entries.reduce((total, entry) => total + (entry.food.calories * entry.quantity), 0);
  };

  const lunchCalories = calculateMealCalories(mealLog.lunch);
  const dinnerCalories = calculateMealCalories(mealLog.dinner);
  const totalIntake = lunchCalories + dinnerCalories;
  
  const dailyBalance = totalIntake - tdee;
  const weeklyBalance = dailyBalance * 7;
  const projectedWeightChange = weeklyBalance / 7700;

  // --- Save History Feature ---
  const saveTodayRecord = () => {
    if (totalIntake === 0) {
      if (!confirm("今日摄入热量为 0，确定要保存吗？")) return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    const newRecord: DailyRecord = {
      date: today,
      calories: totalIntake,
      tdee: tdee,
      weight: stats.weight
    };

    setHistory(prev => {
      // Remove existing entry for today if it exists, then add new one
      const filtered = prev.filter(item => item.date !== today);
      const updated = [...filtered, newRecord].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      localStorage.setItem('calorie_history', JSON.stringify(updated));
      return updated;
    });

    alert("今日记录已保存！");
  };

  const clearHistory = () => {
    if(confirm("确定要清空所有历史记录吗？")) {
      setHistory([]);
      localStorage.removeItem('calorie_history');
    }
  };

  // Filter foods for search
  const allFoods = [...PREDEFINED_FOODS, ...customFoods];
  const filteredFoods = allFoods.filter(f => f.name.toLowerCase().includes(foodSearch.toLowerCase()));

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      
      {/* Header */}
      <header className="flex items-center gap-3 mb-8">
        <div className="bg-blue-600 p-2 rounded-lg text-white">
          <Scale className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">体重变化预测器</h1>
          <p className="text-gray-500 text-sm">基于科学公式的卡路里消耗与体重管理工具</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Stats */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="h-full">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              基础数据
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label icon={Info}>年龄</Label>
                  <Input 
                    type="number" 
                    value={stats.age} 
                    onChange={(e) => handleStatChange('age', Number(e.target.value))} 
                  />
                </div>
                <div>
                  <Label icon={Info}>性别</Label>
                  <Select 
                    value={stats.gender} 
                    onChange={(e) => handleStatChange('gender', e.target.value)}
                  >
                    <option value="male">男</option>
                    <option value="female">女</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label icon={Scale}>体重 (公斤)</Label>
                  <Input 
                    type="number" 
                    value={stats.weight} 
                    onChange={(e) => handleStatChange('weight', Number(e.target.value))} 
                  />
                </div>
                <div>
                  <Label icon={TrendingUp}>身高 (厘米)</Label>
                  <Input 
                    type="number" 
                    value={stats.height} 
                    onChange={(e) => handleStatChange('height', Number(e.target.value))} 
                  />
                </div>
              </div>

              <div>
                <Label icon={Activity}>日常活动水平</Label>
                <Select 
                  value={stats.activityLevel} 
                  onChange={(e) => handleStatChange('activityLevel', Number(e.target.value))}
                >
                  <option value={1.2}>久坐不动 (办公室工作)</option>
                  <option value={1.375}>轻度活动 (每周运动1-3次)</option>
                  <option value={1.55}>中度活动 (每周运动3-5次)</option>
                  <option value={1.725}>高度活动 (每周运动6-7次)</option>
                  <option value={1.9}>专业运动 (体力劳动/每天双倍运动)</option>
                </Select>
              </div>

              <div className="pt-4 border-t border-gray-100 mt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">BMR (基础代谢)</span>
                  <span className="font-mono font-medium">{bmr} kcal</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-900 font-semibold">TDEE (每日总消耗)</span>
                  <span className="font-mono font-bold text-blue-600 text-lg">{tdee} kcal</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Middle Column: Food Log */}
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Utensils className="w-5 h-5 text-green-500" />
              膳食记录
            </h2>

            {/* Meal Selector Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-100">
              <button 
                onClick={() => setSelectedMeal('lunch')}
                className={`pb-2 px-4 text-sm font-medium transition-colors border-b-2 ${
                  selectedMeal === 'lunch' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                午餐 (Lunch)
              </button>
              <button 
                onClick={() => setSelectedMeal('dinner')}
                className={`pb-2 px-4 text-sm font-medium transition-colors border-b-2 ${
                  selectedMeal === 'dinner' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                晚餐 (Dinner)
              </button>
            </div>

            {/* Search / Add Food */}
            <div className="mb-6 relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="搜索食物 (例如: 生煎, 面条, 可乐)..." 
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    value={foodSearch}
                    onChange={(e) => setFoodSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Dropdown Results */}
              {foodSearch && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 max-h-60 overflow-y-auto">
                  {filteredFoods.map(food => (
                    <button 
                      key={food.id}
                      onClick={() => addFood(food)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex justify-between items-center border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-gray-800">{food.name}</span>
                        <span className="text-xs text-gray-400 ml-2">({food.calories} kcal / {food.unit})</span>
                      </div>
                      <Plus className="w-4 h-4 text-blue-500" />
                    </button>
                  ))}
                  
                  {/* AI Estimate Button */}
                  <button 
                    onClick={estimateCaloriesWithAI}
                    disabled={isAiLoading}
                    className="w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-between transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      {isAiLoading ? "AI 正在计算..." : `使用 AI 估算 "${foodSearch}" 的热量`}
                    </span>
                    {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            {/* Food List for Selected Meal */}
            <div className="space-y-3">
              {mealLog[selectedMeal].length === 0 ? (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-100 rounded-lg">
                  暂无记录，请搜索并添加食物
                </div>
              ) : (
                mealLog[selectedMeal].map(entry => (
                  <div key={entry.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg group">
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{entry.food.name}</div>
                      <div className="text-xs text-gray-500">单位热量: {entry.food.calories} kcal / {entry.food.unit}</div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Quantity Control */}
                      <div className="flex items-center bg-white rounded-md border border-gray-200 shadow-sm">
                        <button 
                          onClick={() => updateQuantity(selectedMeal, entry.id, entry.quantity - 0.5)}
                          className="p-1 hover:bg-gray-100 text-gray-500"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input 
                          type="number" 
                          className="w-12 text-center text-sm border-none outline-none py-1 appearance-none bg-transparent"
                          value={entry.quantity}
                          onChange={(e) => updateQuantity(selectedMeal, entry.id, Number(e.target.value))}
                        />
                        <span className="text-xs text-gray-400 pr-2">{entry.food.unit}</span>
                        <button 
                          onClick={() => updateQuantity(selectedMeal, entry.id, entry.quantity + 0.5)}
                          className="p-1 hover:bg-gray-100 text-gray-500"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right w-20">
                        <div className="font-bold text-gray-800">{Math.round(entry.food.calories * entry.quantity)}</div>
                        <div className="text-xs text-gray-400">kcal</div>
                      </div>

                      <button 
                        onClick={() => removeEntry(selectedMeal, entry.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
               <div className="text-sm text-gray-500">
                 提示: 输入 "500ml" 可乐时，选择可乐(100ml)并将数量设为5。
               </div>
               <div className="text-lg font-bold">
                 本餐热量: <span className="text-blue-600">{selectedMeal === 'lunch' ? lunchCalories : dinnerCalories} kcal</span>
               </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Prediction Dashboard */}
      <Card className="bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-green-400" />
            分析与预测
          </h2>
          <button 
            onClick={saveTodayRecord}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg"
          >
            <Save className="w-4 h-4" />
            保存今日记录
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
          
          {/* Calorie Balance */}
          <div className="space-y-2">
            <div className="text-gray-400 text-sm">每日能量平衡 (Intake vs TDEE)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{totalIntake}</span>
              <span className="text-gray-400">/ {tdee} kcal</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
              <div 
                className={`h-2.5 rounded-full transition-all duration-500 ${totalIntake > tdee ? 'bg-red-500' : 'bg-green-500'}`} 
                style={{ width: `${Math.min((totalIntake / tdee) * 100, 100)}%` }}
              ></div>
            </div>
            <div className="text-sm mt-1 flex justify-between">
              <span>{Math.round((totalIntake / tdee) * 100)}%</span>
              <span className={dailyBalance > 0 ? "text-red-400" : "text-green-400"}>
                {dailyBalance > 0 ? `+${dailyBalance} 盈余` : `${dailyBalance} 赤字`}
              </span>
            </div>
          </div>

          {/* Weekly Forecast */}
          <div className="space-y-2 border-l border-gray-700 pl-0 md:pl-8">
            <div className="text-gray-400 text-sm">一周后预计体重变化</div>
            <div className="flex items-center gap-3">
              {projectedWeightChange > 0 ? (
                <TrendingUp className="w-8 h-8 text-red-400" />
              ) : (
                <TrendingDown className="w-8 h-8 text-green-400" />
              )}
              <div>
                <div className="text-3xl font-bold">
                  {projectedWeightChange > 0 ? '+' : ''}{projectedWeightChange.toFixed(2)} 
                  <span className="text-lg font-normal text-gray-400 ml-1">kg</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              基于每日 {dailyBalance > 0 ? '盈余' : '赤字'} {Math.abs(dailyBalance)} kcal 推算
            </div>
          </div>

          {/* Final Result */}
          <div className="space-y-2 border-l border-gray-700 pl-0 md:pl-8">
            <div className="text-gray-400 text-sm">一周后预测体重</div>
            <div className="text-4xl font-bold text-white">
              {(stats.weight + projectedWeightChange).toFixed(2)}
              <span className="text-lg font-normal text-gray-400 ml-1">kg</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              * 理论估算值 (7700kcal ≈ 1kg)，实际情况受水分、激素等影响会有波动。
            </p>
          </div>
        </div>
      </Card>

      {/* History Chart Section */}
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            历史记录与趋势
          </h2>
          {history.length > 0 && (
            <button 
              onClick={clearHistory}
              className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> 清空记录
            </button>
          )}
        </div>
        
        <HistoryChart data={history} />
        
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> 详细记录表
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-6 py-3">日期</th>
                  <th className="px-6 py-3">摄入 (kcal)</th>
                  <th className="px-6 py-3">目标 (TDEE)</th>
                  <th className="px-6 py-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map((record) => (
                  <tr key={record.date} className="bg-white border-b hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{record.date}</td>
                    <td className="px-6 py-4">{record.calories}</td>
                    <td className="px-6 py-4">{record.tdee}</td>
                    <td className="px-6 py-4">
                      {record.calories > record.tdee ? (
                        <span className="text-red-500 font-medium">超标 ({record.calories - record.tdee})</span>
                      ) : (
                        <span className="text-green-500 font-medium">达标</span>
                      )}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-400">暂无数据</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
