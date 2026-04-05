import { Navigate, useSearchParams } from "react-router-dom";

export default function ChatFullscreen() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const params = new URLSearchParams();
  params.set('fullscreen', 'true');
  if (conversationId) params.set('conversationId', conversationId);
  return <Navigate to={`/chat?${params.toString()}`} replace />;
}
