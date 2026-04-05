import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReputationSearchResult } from "@/types/chat";

interface ReputationCarouselProps {
  results: ReputationSearchResult[];
  onSelect: (result: ReputationSearchResult) => void;
}

export function ReputationCarousel({ results, onSelect }: ReputationCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!results || results.length === 0) return null;

  const current = results[activeIndex];
  const canPrev = activeIndex > 0;
  const canNext = activeIndex < results.length - 1;

  return (
    <div className="my-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        <span>Найдено компаний: {results.length}. Выберите нужную:</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!canPrev}
          onClick={() => setActiveIndex(i => i - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Card className="flex-1 p-4 border-primary/20">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="font-medium text-sm leading-tight truncate">
                {current.Name || "Без названия"}
              </h4>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {current.Inn && (
                  <span>ИНН: {current.Inn}</span>
                )}
                {current.Ogrn && (
                  <span>ОГРН: {current.Ogrn}</span>
                )}
              </div>
              {current.Address && (
                <p className="text-xs text-muted-foreground truncate">
                  {current.Address}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="outline" className="text-xs">
                  {current.Type === "Company" ? "Юр. лицо" : current.Type === "Entrepreneur" ? "ИП" : current.Type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {activeIndex + 1} из {results.length}
                </span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full mt-3"
            onClick={() => onSelect(current)}
          >
            Выбрать эту компанию
          </Button>
        </Card>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!canNext}
          onClick={() => setActiveIndex(i => i + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
