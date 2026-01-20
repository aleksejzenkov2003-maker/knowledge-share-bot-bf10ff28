import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square, AtSign } from 'lucide-react';
import { AgentMention } from '@/types/departmentChat';
import { cn } from '@/lib/utils';

interface MentionInputProps {
  availableAgents: AgentMention[];
  onSend: (message: string) => void;
  isGenerating: boolean;
  onStop: () => void;
  placeholder?: string;
}

export const MentionInput: React.FC<MentionInputProps> = ({
  availableAgents,
  onSend,
  isGenerating,
  onStop,
  placeholder = "Напишите @агент и ваш вопрос..."
}) => {
  const [value, setValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredAgents, setFilteredAgents] = useState<AgentMention[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Handle input changes and detect @mentions
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setValue(newValue);

    // Check for @ trigger
    const textBeforeCursor = newValue.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // If there's no space after @, show suggestions
      if (!textAfterAt.includes(' ')) {
        setMentionStart(atIndex);
        const searchTerm = textAfterAt.toLowerCase();
        
        const filtered = availableAgents.filter(agent => 
          agent.name.toLowerCase().includes(searchTerm) ||
          agent.slug.toLowerCase().includes(searchTerm) ||
          (agent.mention_trigger && agent.mention_trigger.toLowerCase().includes(searchTerm))
        );
        
        setFilteredAgents(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(0);
        return;
      }
    }

    setShowSuggestions(false);
    setMentionStart(null);
  }, [availableAgents]);

  // Insert selected agent mention
  const insertMention = useCallback((agent: AgentMention) => {
    if (mentionStart === null) return;

    const trigger = agent.mention_trigger || `@${agent.slug}`;
    const cleanTrigger = trigger.startsWith('@') ? trigger : `@${trigger}`;
    
    const beforeMention = value.slice(0, mentionStart);
    const afterCursor = value.slice(textareaRef.current?.selectionStart || value.length);
    
    const newValue = `${beforeMention}${cleanTrigger} ${afterCursor}`;
    setValue(newValue);
    setShowSuggestions(false);
    setMentionStart(null);

    // Focus and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = beforeMention.length + cleanTrigger.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  }, [mentionStart, value]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredAgents.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredAgents.length) % filteredAgents.length);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        insertMention(filteredAgents[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [showSuggestions, filteredAgents, selectedIndex, insertMention]);

  const handleSend = useCallback(() => {
    if (value.trim() && !isGenerating) {
      onSend(value.trim());
      setValue('');
    }
  }, [value, isGenerating, onSend]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      {/* Agent suggestions dropdown */}
      {showSuggestions && (
        <div 
          ref={suggestionsRef}
          className="absolute bottom-full left-0 right-0 mb-2 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
        >
          <div className="p-1">
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium flex items-center gap-1">
              <AtSign className="h-3 w-3" />
              Выберите агента
            </div>
            {filteredAgents.map((agent, index) => (
              <button
                key={agent.id}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md flex items-center gap-2 transition-colors",
                  index === selectedIndex 
                    ? "bg-accent text-accent-foreground" 
                    : "hover:bg-muted"
                )}
                onClick={() => insertMention(agent)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="text-sm font-medium">
                    {agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {agent.mention_trigger || `@${agent.slug}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[60px] max-h-[200px] resize-none pr-12"
            disabled={isGenerating}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 bottom-2 h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={() => {
              setValue(prev => prev + '@');
              textareaRef.current?.focus();
              // Trigger suggestion display
              const event = { target: { value: value + '@', selectionStart: value.length + 1 } } as any;
              handleChange(event);
            }}
            disabled={isGenerating}
          >
            <AtSign className="h-4 w-4" />
          </Button>
        </div>
        
        {isGenerating ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={onStop}
            className="h-[60px] w-12"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={handleSend}
            disabled={!value.trim()}
            className="h-[60px] w-12"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Help text */}
      <div className="mt-2 text-xs text-muted-foreground">
        Начните с <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">@</kbd> чтобы выбрать агента
      </div>
    </div>
  );
};
