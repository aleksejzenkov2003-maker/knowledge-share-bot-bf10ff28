import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface GoldenResponseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  question: string;
  answer: string;
  roleId?: string;
  departmentId?: string;
}

export function GoldenResponseDialog({
  isOpen,
  onClose,
  question,
  answer,
  roleId,
  departmentId,
}: GoldenResponseDialogProps) {
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing categories on open
  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("golden_responses")
      .select("category")
      .not("category", "is", null);

    if (data) {
      const unique = [...new Set(data.map((d) => d.category).filter(Boolean))];
      setExistingCategories(unique as string[]);
    }
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    const finalCategory = newCategory.trim() || category;
    
    if (!finalCategory) {
      toast({
        title: "Укажите категорию",
        description: "Категория обязательна для сохранения эталонного ответа",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.from("golden_responses").insert({
        question,
        answer,
        category: finalCategory,
        tags,
        notes,
        role_id: roleId || null,
        department_id: departmentId || null,
      });

      if (error) throw error;

      toast({
        title: "Эталон сохранён",
        description: "Ответ добавлен в библиотеку эталонных примеров",
      });

      // Reset form
      setCategory("");
      setNewCategory("");
      setTags([]);
      setNotes("");
      onClose();
    } catch (err) {
      console.error("Error saving golden response:", err);
      toast({
        title: "Ошибка сохранения",
        description: "Не удалось сохранить эталонный ответ",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setCategory("");
    setNewCategory("");
    setTags([]);
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Сохранить как эталон
          </DialogTitle>
          <DialogDescription>
            Этот ответ будет использоваться как образец стиля и качества для
            будущих генераций.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question preview */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Вопрос пользователя</Label>
            <div className="p-3 rounded-md bg-muted text-sm max-h-24 overflow-y-auto">
              {question}
            </div>
          </div>

          {/* Answer preview */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Эталонный ответ</Label>
            <div className="p-3 rounded-md bg-muted text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
              {answer.slice(0, 500)}
              {answer.length > 500 && "..."}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Категория *</Label>
            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  {existingCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="self-center text-muted-foreground">или</span>
              <Input
                placeholder="Новая категория"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Теги</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                placeholder="Добавить тег..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                Добавить
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Заметка (необязательно)</Label>
            <Textarea
              id="notes"
              placeholder="Почему этот ответ эталонный? Что в нём хорошо?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Сохранить эталон
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
