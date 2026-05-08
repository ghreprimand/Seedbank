import { useNavigate } from 'react-router-dom';
import QuickCapture from '@/components/QuickCapture';

export default function IdeaNew() {
  const navigate = useNavigate();
  return (
    <QuickCapture
      onClose={() => navigate('/', { replace: true })}
      onSuccess={(id) => navigate(`/idea/${id}`, { replace: true })}
    />
  );
}
