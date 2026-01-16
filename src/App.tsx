import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminLayout } from "@/components/layout/AdminLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Unauthorized from "./pages/Unauthorized";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Departments from "./pages/Departments";
import Providers from "./pages/Providers";
import Prompts from "./pages/Prompts";
import TestChat from "./pages/TestChat";
import Folders from "./pages/Folders";
import Documents from "./pages/Documents";
import ChatRoles from "./pages/ChatRoles";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/" element={
              <ProtectedRoute>
                <AdminLayout><Dashboard /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute allowedRoles={['admin', 'moderator']}>
                <AdminLayout><Users /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/departments" element={
              <ProtectedRoute>
                <AdminLayout><Departments /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/providers" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><Providers /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/prompts" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><Prompts /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/test-chat" element={
              <ProtectedRoute>
                <AdminLayout><TestChat /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/folders" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><Folders /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/documents" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><Documents /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/chat-roles" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><ChatRoles /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
