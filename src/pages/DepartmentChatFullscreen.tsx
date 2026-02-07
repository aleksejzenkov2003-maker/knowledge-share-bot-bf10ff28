import { Navigate, useSearchParams } from "react-router-dom";

export default function DepartmentChatFullscreen() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams();
  params.set('fullscreen', 'true');
  const chatId = searchParams.get('chatId');
  if (chatId) params.set('chatId', chatId);
  return <Navigate to={`/department-chat?${params.toString()}`} replace />;
}
