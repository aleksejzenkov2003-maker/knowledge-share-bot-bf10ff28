import { HelpCircle, MessageSquare, Users, FolderKanban, LayoutDashboard, UserCircle, BookOpen, Bot, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useTour } from './TourProvider';
import { employeeTours, adminTours, type TourDefinition } from './tourSteps';

const tourIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'chat': MessageSquare,
  'department-chat': Users,
  'projects': FolderKanban,
  'dashboard': LayoutDashboard,
  'chat-roles': UserCircle,
  'knowledge-base': BookOpen,
  'ai-config': Bot,
  'admin': Settings,
};

export const TourButton = () => {
  const { role } = useAuth();
  const { startTour } = useTour();

  const handleStart = (tour: TourDefinition) => {
    startTour(tour.steps, tour.navigateTo);
  };

  const isAdminOrMod = role === 'admin' || role === 'moderator';

  const availableAdminTours = adminTours.filter(t => {
    if (!t.roles) return isAdminOrMod;
    return role && t.roles.includes(role as any);
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Инструкция">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>📖 Инструкция</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Основное
        </DropdownMenuLabel>
        {employeeTours.map(tour => {
          const Icon = tourIcons[tour.id] || HelpCircle;
          return (
            <DropdownMenuItem key={tour.id} onClick={() => handleStart(tour)}>
              <Icon className="h-4 w-4 mr-2" />
              <div>
                <div className="text-sm">{tour.label}</div>
                <div className="text-xs text-muted-foreground">{tour.description}</div>
              </div>
            </DropdownMenuItem>
          );
        })}

        {availableAdminTours.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              Управление
            </DropdownMenuLabel>
            {availableAdminTours.map(tour => {
              const Icon = tourIcons[tour.id] || HelpCircle;
              return (
                <DropdownMenuItem key={tour.id} onClick={() => handleStart(tour)}>
                  <Icon className="h-4 w-4 mr-2" />
                  <div>
                    <div className="text-sm">{tour.label}</div>
                    <div className="text-xs text-muted-foreground">{tour.description}</div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
