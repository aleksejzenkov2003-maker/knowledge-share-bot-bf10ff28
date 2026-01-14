import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX } from 'lucide-react';

const Unauthorized = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Доступ запрещён</CardTitle>
          <CardDescription>
            У вас недостаточно прав для просмотра этой страницы
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Unauthorized;
