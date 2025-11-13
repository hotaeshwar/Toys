import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Package, DollarSign, Hash, LogOut, Plus, Edit2, Trash2, X, ImageIcon, Search, Filter, AlertTriangle, Bell, Upload, FileText, CheckCircle, XCircle, TrendingUp, Users, UserPlus, Settings, Check } from 'lucide-react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  serverTimestamp,
  query,
  orderBy,
  where,
  getDoc,
  setDoc
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDvBAG7oBaYs9k7WvP2MdRNe7aTH9ukpXU",
  authDomain: "toys-b625b.firebaseapp.com",
  projectId: "toys-b625b",
  storageBucket: "toys-b625b.firebasestorage.app",
  messagingSenderId: "692867763409",
  appId: "1:692867763409:web:a2d4a4e9f7bf3985ce09f0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLowStockAlert, setShowLowStockAlert] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ success: [], errors: [] });
  const [isUploading, setIsUploading] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [marginSettings, setMarginSettings] = useState({
    fixedMargin: 0,
    percentageMargin: 0,
    marginType: 'percentage'
  });
  const [showMarginModal, setShowMarginModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showApplyMarginModal, setShowApplyMarginModal] = useState(false);
  
  // Form data state
  const [formData, setFormData] = useState({
    name: '',
    mrp: '',
    sellingPrice: '',
    quantity: '',
    description: '',
    imageUrl: '',
    category: '',
    lowStockThreshold: '10'
  });
  
  // Check if current user is superadmin
  const isSuperAdmin = userRole === 'superadmin';

  // Calculate margin percentage
  const calculateMargin = (mrp, sellingPrice) => {
    const mrpNum = parseFloat(mrp);
    const sellingNum = parseFloat(sellingPrice);
    if (mrpNum > 0 && sellingNum > 0) {
      return ((mrpNum - sellingNum) / mrpNum * 100).toFixed(2);
    }
    return 0;
  };

  // Calculate selling price based on margin settings
  const calculateSellingPrice = (mrp) => {
    const mrpNum = parseFloat(mrp);
    if (!mrpNum) return '';

    if (marginSettings.marginType === 'percentage') {
      const marginPercent = parseFloat(marginSettings.percentageMargin) || 0;
      return (mrpNum * (1 - marginPercent / 100)).toFixed(2);
    } else {
      const fixedMargin = parseFloat(marginSettings.fixedMargin) || 0;
      return Math.max(0, (mrpNum - fixedMargin)).toFixed(2);
    }
  };

  // Toggle product selection
  const toggleProductSelection = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Select all products
  const selectAllProducts = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  // Apply margin to selected products
  const applyMarginToSelectedProducts = async () => {
    if (selectedProducts.length === 0) {
      alert('Please select at least one product to apply margin settings.');
      return;
    }

    setLoading(true);
    try {
      const productsToUpdate = products.filter(p => selectedProducts.includes(p.id));
      
      const batchUpdates = productsToUpdate.map(async (product) => {
        if (product.mrp) {
          const newSellingPrice = calculateSellingPrice(product.mrp);
          const newMargin = calculateMargin(product.mrp, newSellingPrice);
          
          const productRef = doc(db, 'products', product.id);
          await updateDoc(productRef, {
            sellingPrice: parseFloat(newSellingPrice),
            margin: parseFloat(newMargin),
            updatedAt: serverTimestamp()
          });
          
          return {
            ...product,
            sellingPrice: parseFloat(newSellingPrice),
            margin: parseFloat(newMargin)
          };
        }
        return product;
      });

      const updatedProducts = await Promise.all(batchUpdates);
      
      // Update local state
      setProducts(prev => 
        prev.map(p => {
          const updatedProduct = updatedProducts.find(up => up.id === p.id);
          return updatedProduct || p;
        })
      );
      
      setSelectedProducts([]);
      setShowApplyMarginModal(false);
      alert(`Margin settings applied to ${selectedProducts.length} products successfully!`);
    } catch (error) {
      console.error('Error applying margin to products:', error);
      setError('Failed to apply margin settings to selected products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await loadUserRole(currentUser.uid);
        await loadProducts();
        if (await checkSuperAdmin(currentUser.uid)) {
          await loadMarginSettings();
          await loadAdmins();
        }
      } else {
        setUser(null);
        setUserRole('');
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadUserRole = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setUserRole(userDoc.data().role);
      } else {
        setUserRole('admin');
      }
    } catch (error) {
      console.error('Error loading user role:', error);
      setUserRole('admin');
    }
  };

  const checkSuperAdmin = async (userId) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      return userDoc.exists() && userDoc.data().role === 'superadmin';
    } catch (error) {
      console.error('Error checking superadmin:', error);
      return false;
    }
  };

  const loadMarginSettings = async () => {
    try {
      const marginDoc = await getDoc(doc(db, 'settings', 'margin'));
      if (marginDoc.exists()) {
        const data = marginDoc.data();
        setMarginSettings({
          fixedMargin: data.fixedMargin || 0,
          percentageMargin: data.percentageMargin || 0,
          marginType: data.marginType || 'percentage'
        });
      }
    } catch (error) {
      console.error('Error loading margin settings:', error);
    }
  };

  const saveMarginSettings = async () => {
    try {
      const settingsToSave = {
        fixedMargin: parseFloat(marginSettings.fixedMargin) || 0,
        percentageMargin: parseFloat(marginSettings.percentageMargin) || 0,
        marginType: marginSettings.marginType,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'settings', 'margin'), settingsToSave);
      setMarginSettings(settingsToSave);
      setShowMarginModal(false);
      alert('Margin settings saved successfully!');
    } catch (error) {
      console.error('Error saving margin settings:', error);
      setError('Failed to save margin settings');
    }
  };

  const loadAdmins = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'admin'));
      const querySnapshot = await getDocs(q);
      const adminsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAdmins(adminsData);
    } catch (error) {
      console.error('Error loading admins:', error);
    }
  };

  const createAdmin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, newAdminEmail, newAdminPassword);
      const newUser = userCredential.user;

      await setDoc(doc(db, 'users', newUser.uid), {
        email: newAdminEmail,
        role: 'admin',
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });

      await loadAdmins();
      setNewAdminEmail('');
      setNewAdminPassword('');
      setShowAdminModal(false);
      alert('Admin created successfully!');
    } catch (error) {
      console.error('Error creating admin:', error);
      switch (error.code) {
        case 'auth/email-already-in-use':
          setError('Email already in use');
          break;
        case 'auth/invalid-email':
          setError('Invalid email address');
          break;
        case 'auth/weak-password':
          setError('Password is too weak');
          break;
        default:
          setError('Failed to create admin');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const productsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(productsData);
    } catch (error) {
      console.error('Error loading products:', error);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Login error:', error);
      switch (error.code) {
        case 'auth/invalid-email':
          setError('Invalid email address');
          break;
        case 'auth/user-disabled':
          setError('This account has been disabled');
          break;
        case 'auth/user-not-found':
          setError('No account found with this email');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password');
          break;
        case 'auth/invalid-credential':
          setError('Invalid email or password');
          break;
        default:
          setError('Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setEmail('');
      setPassword('');
      setProducts([]);
      setUserRole('');
      setSelectedProducts([]);
    } catch (error) {
      console.error('Logout error:', error);
      setError('Failed to logout');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Auto-calculate selling price if MRP changes and superadmin has margin settings
    if (name === 'mrp' && value && isSuperAdmin) {
      const calculatedPrice = calculateSellingPrice(value);
      if (calculatedPrice) {
        setFormData(prev => ({ ...prev, sellingPrice: calculatedPrice }));
      }
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      mrp: '',
      sellingPrice: '',
      quantity: '',
      description: '',
      imageUrl: '',
      category: '',
      lowStockThreshold: '10'
    });
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      mrp: product.mrp?.toString() || '',
      sellingPrice: product.sellingPrice?.toString() || '',
      quantity: product.quantity?.toString() || '',
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      category: product.category || '',
      lowStockThreshold: (product.lowStockThreshold || 10).toString()
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let mrp = parseFloat(formData.mrp);
      let sellingPrice = parseFloat(formData.sellingPrice);

      // If superadmin and selling price is empty, calculate it from margin settings
      if (isSuperAdmin && mrp && !sellingPrice) {
        sellingPrice = parseFloat(calculateSellingPrice(mrp));
      }

      const margin = calculateMargin(mrp, sellingPrice);

      const productData = {
        name: formData.name,
        mrp: mrp,
        sellingPrice: sellingPrice,
        margin: parseFloat(margin),
        quantity: parseInt(formData.quantity),
        description: formData.description,
        imageUrl: formData.imageUrl,
        category: formData.category,
        lowStockThreshold: parseInt(formData.lowStockThreshold) || 10,
        updatedAt: serverTimestamp()
      };

      if (editingProduct) {
        const productRef = doc(db, 'products', editingProduct.id);
        await updateDoc(productRef, productData);
        
        setProducts(prev => prev.map(p => 
          p.id === editingProduct.id ? { ...p, ...productData } : p
        ));
      } else {
        productData.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'products'), productData);
        
        setProducts(prev => [{
          id: docRef.id,
          ...productData,
          createdAt: new Date(),
          updatedAt: new Date()
        }, ...prev]);
      }
      
      setShowModal(false);
      setFormData({
        name: '',
        mrp: '',
        sellingPrice: '',
        quantity: '',
        description: '',
        imageUrl: '',
        category: '',
        lowStockThreshold: '10'
      });
    } catch (error) {
      console.error('Error saving product:', error);
      setError('Failed to save product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      setLoading(true);
      try {
        await deleteDoc(doc(db, 'products', id));
        setProducts(prev => prev.filter(p => p.id !== id));
        setSelectedProducts(prev => prev.filter(productId => productId !== id));
      } catch (error) {
        console.error('Error deleting product:', error);
        setError('Failed to delete product');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setIsUploading(true);
    setUploadStatus({ success: [], errors: [] });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        const successProducts = [];
        const errorProducts = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values = line.split(',').map(v => v.trim());
          
          try {
            let mrp = parseFloat(values[headers.indexOf('mrp')]) || 0;
            let sellingPrice = parseFloat(values[headers.indexOf('sellingprice')]) || 0;
            
            // Auto-calculate selling price if only MRP is provided and superadmin
            if (mrp && !sellingPrice && isSuperAdmin) {
              sellingPrice = parseFloat(calculateSellingPrice(mrp));
            }

            const margin = calculateMargin(mrp, sellingPrice);

            const productData = {
              name: values[headers.indexOf('name')] || '',
              mrp: mrp,
              sellingPrice: sellingPrice,
              margin: parseFloat(margin),
              quantity: parseInt(values[headers.indexOf('quantity')]) || 0,
              category: values[headers.indexOf('category')] || '',
              description: values[headers.indexOf('description')] || '',
              imageUrl: values[headers.indexOf('imageurl')] || '',
              lowStockThreshold: parseInt(values[headers.indexOf('lowstockthreshold')]) || 10,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };

            if (!productData.name || !productData.category) {
              errorProducts.push({ line: i + 1, error: 'Missing required fields (name or category)' });
              continue;
            }

            const docRef = await addDoc(collection(db, 'products'), productData);
            successProducts.push(productData.name);
            
            setProducts(prev => [{
              id: docRef.id,
              ...productData,
              createdAt: new Date(),
              updatedAt: new Date()
            }, ...prev]);

          } catch (error) {
            errorProducts.push({ line: i + 1, error: error.message });
          }
        }

        setUploadStatus({ success: successProducts, errors: errorProducts });
        setShowUploadModal(true);

      } catch (error) {
        console.error('Error parsing CSV:', error);
        setError('Failed to parse CSV file');
      } finally {
        setIsUploading(false);
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockProducts = products.filter(p => 
    p.quantity <= (p.lowStockThreshold || 10)
  );

  const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="inline-block w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
                <Package className="w-8 h-8 text-indigo-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                <span className="text-indigo-600">ToysMaryland</span> Admin Panel
              </h1>
              <p className="text-gray-600">Sign in to manage products</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition pr-12"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Product Management</h1>
                <p className="text-sm text-gray-600">
                  {user.email} 
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                    userRole === 'superadmin' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {userRole === 'superadmin' ? 'Super Admin' : 'Admin'}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => setShowMarginModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition font-medium"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Margin Settings</span>
                  </button>
                  {selectedProducts.length > 0 && (
                    <button
                      onClick={() => setShowApplyMarginModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
                    >
                      <TrendingUp className="w-4 h-4" />
                      <span>Apply Margin ({selectedProducts.length})</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowAdminModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition font-medium"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Manage Admins</span>
                  </button>
                </>
              )}
              {lowStockProducts.length > 0 && (
                <div className="relative">
                  <button className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition font-medium">
                    <Bell className="w-4 h-4" />
                    <span className="hidden sm:inline">Alerts</span>
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {lowStockProducts.length}
                    </span>
                  </button>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Low Stock Alert Banner */}
        {lowStockProducts.length > 0 && showLowStockAlert && (
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border-l-4 border-orange-500 rounded-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-orange-900 mb-2">
                    Low Stock Alert! {lowStockProducts.length} {lowStockProducts.length === 1 ? 'Product' : 'Products'} Running Low
                  </h3>
                  <div className="space-y-1">
                    {lowStockProducts.map(product => (
                      <div key={product.id} className="text-sm text-orange-800">
                        <span className="font-semibold">{product.name}</span>
                        <span className="text-orange-600"> - Only {product.quantity} left (Threshold: {product.lowStockThreshold || 10})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowLowStockAlert(false)}
                className="text-orange-400 hover:text-orange-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="flex-1 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="relative sm:w-48">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none bg-white"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={openAddModal}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold shadow-md hover:shadow-lg"
              >
                <Plus className="w-5 h-5" />
                <span>Add Product</span>
              </button>
              <label className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold shadow-md hover:shadow-lg cursor-pointer">
                <Upload className="w-5 h-5" />
                <span>Import CSV</span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>

          {/* Selection Controls for Superadmin */}
          {isSuperAdmin && filteredProducts.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={selectAllProducts}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-50 transition text-sm font-medium"
                  >
                    <Check className="w-4 h-4" />
                    {selectedProducts.length === filteredProducts.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-blue-700 text-sm">
                    {selectedProducts.length} of {filteredProducts.length} products selected
                  </span>
                </div>
                {selectedProducts.length > 0 && (
                  <button
                    onClick={() => setShowApplyMarginModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Apply Margin to Selected
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {loading && products.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600 mt-4">Loading products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Products Found</h3>
            <p className="text-gray-600 mb-6">Get started by adding your first product</p>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(product => {
              const isLowStock = product.quantity <= (product.lowStockThreshold || 10);
              const isSelected = selectedProducts.includes(product.id);
              
              return (
                <div 
                  key={product.id} 
                  className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition overflow-hidden group ${
                    isLowStock ? 'ring-2 ring-orange-400' : ''
                  } ${isSelected ? 'ring-2 ring-green-500' : ''}`}
                >
                  {/* Selection Checkbox for Superadmin */}
                  {isSuperAdmin && (
                    <div className="absolute top-3 left-3 z-10">
                      <button
                        onClick={() => toggleProductSelection(product.id)}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition ${
                          isSelected 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : 'bg-white border-gray-300 hover:border-green-500'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  
                  <div className="relative h-48 bg-gray-100 overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-16 h-16 text-gray-300" />
                      </div>
                    )}
                    {isLowStock && (
                      <div className="absolute top-3 right-3 bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        Low Stock
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 bg-white px-3 py-1 rounded-full text-sm font-semibold text-indigo-600">
                      {product.category}
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-800 mb-2 truncate">{product.name}</h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{product.description}</p>
                    
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-blue-600 text-xs mb-1">
                          <span>MRP</span>
                        </div>
                        <p className="text-sm font-bold text-blue-700">₹{(product.mrp || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="flex items-center gap-1 text-green-600 text-xs mb-1">
                          <DollarSign className="w-3 h-3" />
                          <span>Price</span>
                        </div>
                        <p className="text-sm font-bold text-green-700">₹{(product.sellingPrice || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    <div className={`grid ${isSuperAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mb-4`}>
                      {isSuperAdmin && (
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <div className="flex items-center gap-1 text-purple-600 text-xs mb-1">
                            <TrendingUp className="w-3 h-3" />
                            <span>Margin</span>
                          </div>
                          <p className="text-sm font-bold text-purple-700">{(product.margin || 0).toFixed(2)}%</p>
                        </div>
                      )}
                      <div className={`p-3 rounded-lg ${isLowStock ? 'bg-orange-50' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-1 text-gray-600 text-xs mb-1">
                          <Hash className="w-3 h-3" />
                          <span>Stock</span>
                        </div>
                        <p className={`text-sm font-bold ${isLowStock ? 'text-orange-600' : 'text-gray-800'}`}>
                          {product.quantity}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(product)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition font-medium"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="e.g., Wireless Headphones"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    MRP (₹) *
                  </label>
                  <input
                    type="number"
                    name="mrp"
                    value={formData.mrp}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="999.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    name="sellingPrice"
                    value={formData.sellingPrice}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder={isSuperAdmin ? "Auto-calculated" : "799.00"}
                    required
                  />
                </div>

                {isSuperAdmin && formData.mrp && (
                  <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-800 text-sm">
                      <TrendingUp className="w-4 h-4" />
                      <span>
                        Current Margin Settings: {marginSettings.marginType === 'percentage' 
                          ? `${marginSettings.percentageMargin}%` 
                          : `₹${marginSettings.fixedMargin}`}
                      </span>
                    </div>
                    {formData.sellingPrice && (
                      <div className="flex items-center gap-2 text-green-800 mt-2">
                        <span className="font-semibold">
                          Profit Margin: {calculateMargin(formData.mrp, formData.sellingPrice)}%
                        </span>
                        <span className="text-sm text-green-600">
                          (₹{(parseFloat(formData.mrp) - parseFloat(formData.sellingPrice)).toFixed(2)} profit per unit)
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Low Stock Alert Threshold *
                  </label>
                  <input
                    type="number"
                    name="lowStockThreshold"
                    value={formData.lowStockThreshold}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="10"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    You'll receive an alert when stock reaches this level
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <input
                    type="text"
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="e.g., Electronics, Accessories"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image URL
                  </label>
                  <input
                    type="url"
                    name="imageUrl"
                    value={formData.imageUrl}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="4"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    placeholder="Enter product description..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Add Product')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Margin Settings Modal */}
      {showMarginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                Margin Settings
              </h2>
              <button
                onClick={() => setShowMarginModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Margin Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMarginSettings(prev => ({ ...prev, marginType: 'percentage' }))}
                    className={`p-3 border rounded-lg text-center transition ${
                      marginSettings.marginType === 'percentage'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarginSettings(prev => ({ ...prev, marginType: 'fixed' }))}
                    className={`p-3 border rounded-lg text-center transition ${
                      marginSettings.marginType === 'fixed'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Fixed (₹)
                  </button>
                </div>
              </div>

              {marginSettings.marginType === 'percentage' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Margin Percentage (%)
                  </label>
                  <input
                    type="number"
                    value={marginSettings.percentageMargin}
                    onChange={(e) => setMarginSettings(prev => ({ ...prev, percentageMargin: e.target.value }))}
                    step="0.01"
                    min="0"
                    max="100"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="20.00"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This percentage will be deducted from MRP to calculate selling price
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fixed Margin (₹)
                  </label>
                  <input
                    type="number"
                    value={marginSettings.fixedMargin}
                    onChange={(e) => setMarginSettings(prev => ({ ...prev, fixedMargin: e.target.value }))}
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="50.00"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This fixed amount will be deducted from MRP to calculate selling price
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={saveMarginSettings}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
                >
                  Save Settings
                </button>
                <button
                  onClick={() => setShowMarginModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apply Margin Modal */}
      {showApplyMarginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                Apply Margin Settings
              </h2>
              <button
                onClick={() => setShowApplyMarginModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-semibold">Apply to {selectedProducts.length} Products</span>
                </div>
                <p className="text-yellow-700 text-sm mt-2">
                  This will update the selling price and margin for all selected products based on your current margin settings.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-blue-800 text-sm">
                  <p className="font-semibold">Current Margin Settings:</p>
                  <p className="mt-1">
                    {marginSettings.marginType === 'percentage' 
                      ? `${marginSettings.percentageMargin}% discount from MRP` 
                      : `₹${marginSettings.fixedMargin} fixed discount from MRP`}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={applyMarginToSelectedProducts}
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
                >
                  {loading ? 'Applying...' : 'Apply Margin'}
                </button>
                <button
                  onClick={() => setShowApplyMarginModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Management Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Users className="w-6 h-6" />
                Manage Admins
              </h2>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={createAdmin} className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-3">Create New Admin</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="admin@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Enter password"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
                >
                  {loading ? 'Creating Admin...' : 'Create Admin'}
                </button>
              </form>

              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Existing Admins</h3>
                {admins.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No admins found</p>
                ) : (
                  <div className="space-y-3">
                    {admins.map(admin => (
                      <div key={admin.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{admin.email}</p>
                          <p className="text-sm text-gray-500">
                            Created: {admin.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                          </p>
                        </div>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                          Admin
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Status Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-6 h-6" />
                CSV Import Results
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Success Section */}
              {uploadStatus.success.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-800 font-semibold mb-3">
                    <CheckCircle className="w-5 h-5" />
                    <span>Successfully Imported: {uploadStatus.success.length} products</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {uploadStatus.success.map((name, idx) => (
                      <div key={idx} className="text-sm text-green-700 pl-7">
                        ✓ {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Section */}
              {uploadStatus.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-800 font-semibold mb-3">
                    <XCircle className="w-5 h-5" />
                    <span>Failed to Import: {uploadStatus.errors.length} rows</span>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {uploadStatus.errors.map((err, idx) => (
                      <div key={idx} className="text-sm text-red-700 pl-7">
                        ✗ Line {err.line}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CSV Format Guide */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">CSV Format Guide:</h3>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>Required headers (case-insensitive):</p>
                  <code className="block bg-white p-2 rounded mt-2 text-xs">
                    name,mrp,sellingPrice,quantity,category,description,imageUrl,lowStockThreshold
                  </code>
                  <p className="mt-2">Example row:</p>
                  <code className="block bg-white p-2 rounded mt-1 text-xs">
                    Toy Car,999.00,799.00,50,Toys,Red racing car,https://example.com/car.jpg,10
                  </code>
                  <p className="mt-2 text-blue-600 font-medium">
                    Note: {isSuperAdmin ? 'Margin will be auto-calculated from MRP and Selling Price' : 'Normal admins cannot see margin information'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowUploadModal(false)}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 text-center">
            <div className="inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-800 font-semibold">Importing products...</p>
          </div>
        </div>
      )}
    </div>
  );
}