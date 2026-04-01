import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TourProvider } from "@/components/tour/TourProvider";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Unauthorized from "./pages/Unauthorized";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Departments from "./pages/Departments";
import Providers from "./pages/Providers";
import Prompts from "./pages/Prompts";
import TestChat from "./pages/TestChat";
import Chat from "./pages/Chat";
import ChatFullscreen from "./pages/ChatFullscreen";
import DepartmentChat from "./pages/DepartmentChat";
import DepartmentChatFullscreen from "./pages/DepartmentChatFullscreen";
import Folders from "./pages/Folders";
import Documents from "./pages/Documents";
import ChatRoles from "./pages/ChatRoles";
import ChatLogs from "./pages/ChatLogs";
import ApiKeys from "./pages/ApiKeys";
import BitrixChatSecure from "./pages/BitrixChatSecure";
import BitrixPersonalChat from "./pages/BitrixPersonalChat";
import BitrixDepartmentChat from "./pages/BitrixDepartmentChat";
import BitrixSessions from "./pages/BitrixSessions";
import GoldenResponses from "./pages/GoldenResponses";
 import PiiAudit from "./pages/PiiAudit";
import Projects from "./pages/Projects";
import ProjectChat from "./pages/ProjectChat";
import Reputation from "./pages/Reputation";
import SbisReport from "./pages/SbisReport";
import Trademarks from "./pages/Trademarks";
import AudioAnalysis from "./pages/AudioAnalysis";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TourProvider>
          <Routes>
            {/* Public Bitrix widget routes - JWT auth inside */}
            <Route path="/bitrix-chat" element={<BitrixChatSecure />} />
            <Route path="/bitrix-personal" element={<BitrixPersonalChat />} />
            <Route path="/bitrix-department" element={<BitrixDepartmentChat />} />
            
            <Route path="/login" element={<Login />} />
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
            <Route path="/chat" element={
              <ProtectedRoute>
                <AdminLayout><Chat /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/chat-fullscreen" element={
              <ProtectedRoute>
                <ChatFullscreen />
              </ProtectedRoute>
            } />
            <Route path="/department-chat" element={
              <ProtectedRoute>
                <AdminLayout><DepartmentChat /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/department-chat-fullscreen" element={
              <ProtectedRoute>
                <DepartmentChatFullscreen />
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
            <Route path="/chat-logs" element={
              <ProtectedRoute allowedRoles={['admin', 'moderator']}>
                <AdminLayout><ChatLogs /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/api-keys" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><ApiKeys /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/bitrix-sessions" element={
              <ProtectedRoute allowedRoles={['admin', 'moderator']}>
                <AdminLayout><BitrixSessions /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/golden-responses" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><GoldenResponses /></AdminLayout>
              </ProtectedRoute>
            } />
             <Route path="/pii-audit" element={
               <ProtectedRoute allowedRoles={['admin']}>
                 <AdminLayout><PiiAudit /></AdminLayout>
               </ProtectedRoute>
             } />
            <Route path="/projects" element={
              <ProtectedRoute>
                <AdminLayout><Projects /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/projects/:id" element={
              <ProtectedRoute>
                <AdminLayout><ProjectChat /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/reputation" element={
              <ProtectedRoute>
                <AdminLayout><Reputation /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/sbis" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminLayout><SbisReport /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/trademarks" element={
              <ProtectedRoute>
                <AdminLayout><Trademarks /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="/audio-analysis" element={
              <ProtectedRoute>
                <AdminLayout><AudioAnalysis /></AdminLayout>
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </TourProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
