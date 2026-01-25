import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Upload, FileText, Trash2, Eye, Loader2, RefreshCw, ImageIcon, X, Split, AlertTriangle } from "lucide-react";
import { splitPdf, getPdfPageCount, generatePartFileName, SplitProgress, estimatePdfParts } from "@/components/documents/PdfSplitter";

interface DocumentFolder {
  id: string;
  name: string;
  slug: string;
}

interface Document {
  id: string;
  name: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  status: string;
  chunk_count: number | null;
  folder_id: string | null;
  document_type: string | null;
  created_at: string;
  folder?: DocumentFolder | null;
  has_trademark?: boolean;
  trademark_image_path?: string | null;
  parent_document_id?: string | null;
  part_number?: number | null;
  total_parts?: number | null;
}

const DOCUMENT_TYPES: Record<string, string> = {
  auto: "Автоопределение",
  legal: "Закон / Кодекс / НПА",
  court: "Судебное решение",
  registration_decision: "Решение Роспатента",
  contract: "Договор",
  business: "Бизнес-документ",
  general: "Общий документ",
};

interface DocumentChunk {
  id: string;
  content: string;
  chunk_index: number;
}

// New limits for split upload
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB - maximum file we can handle with splitting
const MAX_FILE_SIZE_MB = 50;
const SPLIT_THRESHOLD = 10 * 1024 * 1024; // 10 MB - threshold for automatic splitting
const SPLIT_THRESHOLD_MB = 10;
const PAGES_PER_PART = 50; // Pages per split part

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидает", variant: "outline" },
  processing: { label: "Обработка", variant: "secondary" },
  ready: { label: "Готов", variant: "default" },
  error: { label: "Ошибка", variant: "destructive" },
};

interface UploadProgress {
  stage: 'idle' | 'analyzing' | 'splitting' | 'uploading' | 'processing' | 'complete';
  currentPart?: number;
  totalParts?: number;
  message: string;
  percent: number;
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [chunksDialogOpen, setChunksDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filterFolder, setFilterFolder] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New state for split upload
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ 
    stage: 'idle', 
    message: '', 
    percent: 0 
  });
  const [splitWarningOpen, setSplitWarningOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [estimatedParts, setEstimatedParts] = useState<number>(0);

  const [formData, setFormData] = useState({
    name: "",
    folder_id: "",
    document_type: "auto",
    has_trademark: false,
  });
  const [trademarkFile, setTrademarkFile] = useState<File | null>(null);
  const [trademarkPreview, setTrademarkPreview] = useState<string | null>(null);
  const trademarkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [filterFolder]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [foldersRes, docsQuery] = await Promise.all([
        supabase.from("document_folders").select("id, name, slug").order("name"),
        filterFolder
          ? supabase
              .from("documents")
              .select("*, folder:document_folders(id, name, slug)")
              .eq("folder_id", filterFolder)
              .order("created_at", { ascending: false })
          : supabase
              .from("documents")
              .select("*, folder:document_folders(id, name, slug)")
              .order("created_at", { ascending: false }),
      ]);

      if (foldersRes.error) throw foldersRes.error;
      if (docsQuery.error) throw docsQuery.error;

      setFolders(foldersRes.data || []);
      setDocuments(docsQuery.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormData((prev) => ({
      ...prev,
      name: prev.name || file.name.replace(/\.[^/.]+$/, ""),
    }));
  };

  const handleTrademarkSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTrademarkFile(file);
      const reader = new FileReader();
      reader.onload = () => setTrademarkPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const clearTrademarkFile = () => {
    setTrademarkFile(null);
    setTrademarkPreview(null);
    if (trademarkInputRef.current) {
      trademarkInputRef.current.value = "";
    }
  };

  // Sanitize filename for storage (remove special chars, transliterate)
  const sanitizeFileName = (name: string): string => {
    // Transliteration map for Cyrillic
    const cyrillicToLatin: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
      'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
      'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
      'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
      'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '',
      'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };
    
    // Transliterate Cyrillic
    let result = name.split('').map(char => cyrillicToLatin[char] || char).join('');
    
    // Replace special characters with underscores, keep only alphanumeric, dots, dashes, underscores
    result = result.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Remove multiple consecutive underscores
    result = result.replace(/_+/g, '_');
    
    // Remove leading/trailing underscores
    result = result.replace(/^_+|_+$/g, '');
    
    return result || 'document';
  };

  // Upload a single file (either standalone or part of split)
  const uploadSingleFile = async (
    file: File | Blob,
    fileName: string,
    docName: string,
    parentId?: string,
    partNumber?: number,
    totalParts?: number
  ): Promise<string | null> => {
    try {
      const sanitizedName = sanitizeFileName(fileName);
      const storagePath = `${Date.now()}-${sanitizedName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("rag-documents")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Upload trademark image if provided (only for main document, not parts)
      let trademarkPath: string | null = null;
      if (!parentId && formData.has_trademark && trademarkFile) {
        const trademarkFileName = `trademarks/${Date.now()}-${sanitizeFileName(trademarkFile.name)}`;
        const { error: tmError } = await supabase.storage
          .from("rag-documents")
          .upload(trademarkFileName, trademarkFile);
        
        if (tmError) {
          console.error("Trademark upload error:", tmError);
        } else {
          trademarkPath = trademarkFileName;
        }
      }

      // Create document record
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          name: docName,
          file_name: fileName,
          file_type: 'application/pdf',
          file_size: file instanceof File ? file.size : (file as Blob).size,
          storage_path: storagePath,
          folder_id: formData.folder_id || null,
          document_type: formData.document_type,
          status: "pending",
          has_trademark: !parentId && formData.has_trademark,
          trademark_image_path: trademarkPath,
          parent_document_id: parentId || null,
          part_number: partNumber || null,
          total_parts: totalParts || null,
        })
        .select()
        .single();

      if (docError) throw docError;

      return doc.id;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  };

  // Process a document (trigger Edge Function)
  const processDocument = async (docId: string): Promise<boolean> => {
    try {
      const processPromise = supabase.functions.invoke("process-document", {
        body: { document_id: docId },
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 120000)
      );
      
      const result = await Promise.race([processPromise, timeoutPromise]) as { error?: Error };
      
      if (result?.error) {
        console.error("Processing error:", result.error);
        await supabase
          .from("documents")
          .update({ status: "error" })
          .eq("id", docId);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Processing invocation error:", err);
      await supabase
        .from("documents")
        .update({ status: "error" })
        .eq("id", docId);
      return false;
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Выберите файл");
      return;
    }

    // Check maximum file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE_MB} MB. Ваш файл: ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
      return;
    }

    // Check if file needs splitting
    if (file.size > SPLIT_THRESHOLD && file.type === 'application/pdf') {
      // Estimate parts and show warning
      const estimated = estimatePdfParts(file.size, PAGES_PER_PART);
      setEstimatedParts(estimated);
      setPendingFile(file);
      setSplitWarningOpen(true);
      return;
    }

    // Regular upload for small files
    await performUpload(file, false);
  };

  const performUpload = async (file: File, needsSplit: boolean) => {
    setUploading(true);
    setSplitWarningOpen(false);
    setPendingFile(null);

    try {
      if (needsSplit && file.type === 'application/pdf') {
        // Split upload flow
        setUploadProgress({ stage: 'analyzing', message: 'Анализ PDF...', percent: 5 });
        
        const pageCount = await getPdfPageCount(file);
        const actualParts = Math.ceil(pageCount / PAGES_PER_PART);
        
        setUploadProgress({ 
          stage: 'splitting', 
          message: `Разбиение на ${actualParts} частей...`, 
          percent: 10 
        });
        
        // Split the PDF
        const parts = await splitPdf(file, PAGES_PER_PART, (progress: SplitProgress) => {
          const percent = 10 + (progress.currentPart / progress.totalParts) * 30;
          setUploadProgress({
            stage: 'splitting',
            currentPart: progress.currentPart,
            totalParts: progress.totalParts,
            message: `Разбиение: часть ${progress.currentPart} из ${progress.totalParts}`,
            percent,
          });
        });

        // Upload parts sequentially
        const docIds: string[] = [];
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const partFileName = generatePartFileName(file.name, part.partNumber, part.totalParts);
          const partDocName = `${formData.name} (часть ${part.partNumber}/${part.totalParts}, стр. ${part.pageStart}-${part.pageEnd})`;
          
          setUploadProgress({
            stage: 'uploading',
            currentPart: i + 1,
            totalParts: parts.length,
            message: `Загрузка части ${i + 1} из ${parts.length}...`,
            percent: 40 + ((i + 1) / parts.length) * 30,
          });

          const docId = await uploadSingleFile(
            part.blob,
            partFileName,
            partDocName,
            undefined, // parentId - first part has no parent
            part.partNumber,
            part.totalParts
          );
          
          if (docId) docIds.push(docId);
        }

        // Process parts sequentially
        let successCount = 0;
        for (let i = 0; i < docIds.length; i++) {
          setUploadProgress({
            stage: 'processing',
            currentPart: i + 1,
            totalParts: docIds.length,
            message: `Обработка части ${i + 1} из ${docIds.length}...`,
            percent: 70 + ((i + 1) / docIds.length) * 25,
          });
          
          const success = await processDocument(docIds[i]);
          if (success) successCount++;
        }

        setUploadProgress({ stage: 'complete', message: 'Готово!', percent: 100 });
        
        if (successCount === docIds.length) {
          toast.success(`Документ разбит на ${parts.length} частей и успешно обработан`);
        } else {
          toast.warning(`Документ разбит на ${parts.length} частей. Успешно обработано: ${successCount}`);
        }
      } else {
        // Regular single file upload
        setUploadProgress({ stage: 'uploading', message: 'Загрузка...', percent: 30 });
        
        const docId = await uploadSingleFile(file, file.name, formData.name);
        
        if (docId) {
          setUploadProgress({ stage: 'processing', message: 'Обработка документа...', percent: 60 });
          const success = await processDocument(docId);
          
          setUploadProgress({ stage: 'complete', message: 'Готово!', percent: 100 });
          
          if (success) {
            toast.success("Документ загружен и обработан");
          } else {
            toast.warning("Документ загружен, но обработка не удалась");
          }
        }
      }

      // Reset form
      setUploadDialogOpen(false);
      setFormData({ name: "", folder_id: "", document_type: "auto", has_trademark: false });
      setTrademarkFile(null);
      setTrademarkPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (trademarkInputRef.current) trademarkInputRef.current.value = "";
      fetchData();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(error.message || "Ошибка загрузки");
    } finally {
      setUploading(false);
      setTimeout(() => {
        setUploadProgress({ stage: 'idle', message: '', percent: 0 });
      }, 2000);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Удалить документ "${doc.name}"?`)) return;

    try {
      // Delete from storage if exists
      if (doc.storage_path) {
        await supabase.storage.from("rag-documents").remove([doc.storage_path]);
      }

      // Delete document record (cascades to chunks)
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;

      toast.success("Документ удален");
      fetchData();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast.error(error.message || "Ошибка удаления");
    }
  };

  const handleViewChunks = async (doc: Document) => {
    setSelectedDoc(doc);
    setChunksDialogOpen(true);

    try {
      const { data, error } = await supabase
        .from("document_chunks")
        .select("id, content, chunk_index")
        .eq("document_id", doc.id)
        .order("chunk_index");

      if (error) throw error;
      setChunks(data || []);
    } catch (error) {
      console.error("Error fetching chunks:", error);
      toast.error("Ошибка загрузки чанков");
    }
  };

  const handleReprocess = async (doc: Document) => {
    // Check file size before reprocessing
    if (doc.file_size && doc.file_size > SPLIT_THRESHOLD) {
      toast.error(`Файл слишком большой для переобработки (${(doc.file_size / (1024 * 1024)).toFixed(1)} MB). Удалите документ и загрузите заново — он будет автоматически разбит на части.`);
      return;
    }

    try {
      await supabase
        .from("documents")
        .update({ status: "pending" })
        .eq("id", doc.id);

      const { error: processError } = await supabase.functions.invoke("process-document", {
        body: { document_id: doc.id },
      });

      if (processError) {
        throw new Error(processError.message);
      }

      toast.success("Переобработка запущена");
      fetchData();
    } catch (error: any) {
      console.error("Error reprocessing document:", error);
      toast.error(error.message || "Ошибка переобработки");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Документы</h1>
          <p className="text-muted-foreground">
            Загрузка и управление документами для RAG (до {MAX_FILE_SIZE_MB} MB)
          </p>
        </div>

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Загрузить документ
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Загрузка документа</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Файл</Label>
                <Input
                  id="file"
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.doc,.docx,.txt,.md"
                  onChange={handleFileSelect}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Поддерживаются: PDF (до {MAX_FILE_SIZE_MB} MB), DOC, DOCX, TXT, MD.
                  PDF больше {SPLIT_THRESHOLD_MB} MB будут автоматически разбиты на части.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Название</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Название документа"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="folder_id">Папка</Label>
                <Select
                  value={formData.folder_id || "_none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, folder_id: value === "_none" ? "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите папку" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Без папки</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="document_type">Тип документа</Label>
                <Select
                  value={formData.document_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, document_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOCUMENT_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Выберите тип для правильного структурирования документа
                </p>
              </div>

              {/* Trademark checkbox and upload */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="has_trademark"
                    checked={formData.has_trademark}
                    onCheckedChange={(checked) => {
                      setFormData((prev) => ({ ...prev, has_trademark: !!checked }));
                      if (!checked) {
                        clearTrademarkFile();
                      }
                    }}
                  />
                  <Label htmlFor="has_trademark" className="font-normal cursor-pointer">
                    Документ содержит товарный знак
                  </Label>
                </div>

                {formData.has_trademark && (
                  <div className="space-y-2 pl-6">
                    <Label>Изображение товарного знака</Label>
                    <Input
                      type="file"
                      ref={trademarkInputRef}
                      accept="image/*"
                      onChange={handleTrademarkSelect}
                    />
                    {trademarkPreview && (
                      <div className="relative inline-block border rounded-lg p-2 bg-muted/30">
                        <img 
                          src={trademarkPreview} 
                          alt="Товарный знак" 
                          className="max-h-24 object-contain"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground"
                          onClick={clearTrademarkFile}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Загрузите изображение товарного знака (PNG, JPG, WebP)
                    </p>
                  </div>
                )}
              </div>

              {/* Upload progress */}
              {uploading && uploadProgress.stage !== 'idle' && (
                <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">{uploadProgress.message}</span>
                  </div>
                  <Progress value={uploadProgress.percent} className="h-2" />
                  {uploadProgress.currentPart && uploadProgress.totalParts && (
                    <p className="text-xs text-muted-foreground text-center">
                      Часть {uploadProgress.currentPart} из {uploadProgress.totalParts}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUploadDialogOpen(false)}
                  disabled={uploading}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Загрузить
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Split warning dialog */}
      <AlertDialog open={splitWarningOpen} onOpenChange={setSplitWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Split className="h-5 w-5 text-amber-500" />
              Большой файл будет разбит на части
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Файл превышает {SPLIT_THRESHOLD_MB} MB и будет автоматически разбит 
                на ~{estimatedParts} частей по {PAGES_PER_PART} страниц каждая.
              </p>
              <p className="text-amber-600 dark:text-amber-400">
                Это может занять несколько минут. Не закрывайте страницу во время загрузки.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFile(null)}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingFile && performUpload(pendingFile, true)}>
              <Split className="h-4 w-4 mr-2" />
              Разбить и загрузить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Список документов</CardTitle>
              <CardDescription>
                Всего документов: {documents.length}
              </CardDescription>
            </div>
            <Select 
              value={filterFolder || "_all"} 
              onValueChange={(value) => setFilterFolder(value === "_all" ? "" : value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Все папки" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Все папки</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Документы не найдены
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Файл</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Папка</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-24">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const status = STATUS_LABELS[doc.status] || STATUS_LABELS.pending;
                  const isPart = doc.part_number && doc.total_parts;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className={isPart ? "text-muted-foreground" : ""}>
                            {doc.name}
                          </span>
                          {isPart && (
                            <Badge variant="outline" className="text-xs">
                              {doc.part_number}/{doc.total_parts}
                            </Badge>
                          )}
                          {doc.has_trademark && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ImageIcon className="h-4 w-4 text-blue-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Есть изображение товарного знака</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {doc.file_name || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {DOCUMENT_TYPES[doc.document_type || "auto"] || "Авто"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {doc.folder ? (
                          <Badge variant="outline">{doc.folder.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell>{doc.chunk_count || 0}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-amber-500"
                                  onClick={() => handleReprocess(doc)}
                                  disabled={doc.status === "processing" || (doc.file_size && doc.file_size > SPLIT_THRESHOLD)}
                                  title="Переобработать"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              {doc.file_size && doc.file_size > SPLIT_THRESHOLD && (
                                <TooltipContent>
                                  <p>Файл слишком большой для переобработки</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewChunks(doc)}
                            disabled={doc.status !== "ready"}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(doc)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={chunksDialogOpen} onOpenChange={setChunksDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Chunks документа: {selectedDoc?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {chunks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Chunks не найдены
              </div>
            ) : (
              chunks.map((chunk) => (
                <Card key={chunk.id}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      Chunk #{chunk.chunk_index + 1}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <p className="text-sm whitespace-pre-wrap">{chunk.content}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
