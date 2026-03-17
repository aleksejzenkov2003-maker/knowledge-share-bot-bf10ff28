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
import { Plus, Upload, FileText, Trash2, Eye, Loader2, RefreshCw, ImageIcon, X, Split, AlertTriangle, LayoutList, LayoutGrid, Shield, Archive } from "lucide-react";
import { MoveDocumentDialog } from "@/components/documents/MoveDocumentDialog";
import { splitPdf, getPdfPageCount, generatePartFileName, SplitProgress, estimatePdfParts } from "@/components/documents/pdfSplitter";
import { splitExcel, needsExcelSplit, estimateExcelParts, generateExcelPartFileName, ExcelSplitProgress } from "@/components/documents/excelSplitter";
import { isArchiveFile, extractArchive } from "@/components/documents/archiveExtractor";
import { DocumentTree, Document as TreeDocument, DocumentFolder as TreeFolder, MissingPartsInfo, DocumentGroup } from "@/components/documents/DocumentTree";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PiiPreviewDialog } from "@/components/documents/PiiPreviewDialog";

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
const SPLIT_THRESHOLD = 4 * 1024 * 1024; // 4 MB - threshold for automatic splitting
const SPLIT_THRESHOLD_MB = 4;
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
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
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
  
  // Missing parts upload state
  const [missingPartsDialogOpen, setMissingPartsDialogOpen] = useState(false);
  const [missingPartsInfo, setMissingPartsInfo] = useState<MissingPartsInfo | null>(null);
  const missingPartsFileInputRef = useRef<HTMLInputElement>(null);
  
  // Delete group state
  const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<DocumentGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  // PII Preview state
  const [piiPreviewOpen, setPiiPreviewOpen] = useState(false);
  const [piiPreviewText, setPiiPreviewText] = useState("");

  // Move/Copy state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveDialogMode, setMoveDialogMode] = useState<"move" | "copy">("move");
  const [moveTargetDoc, setMoveTargetDoc] = useState<Document | null>(null);
  const [moveTargetGroup, setMoveTargetGroup] = useState<DocumentGroup | null>(null);
  const [movingDoc, setMovingDoc] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    folder_id: "",
    document_type: "auto",
    has_trademark: false,
    contains_pii: false,
  });
  const [trademarkFile, setTrademarkFile] = useState<File | null>(null);
  const [trademarkPreview, setTrademarkPreview] = useState<string | null>(null);
  const trademarkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, [filterFolder]);

  // Client-side stuck detection: mark documents stuck in "processing" > 10 min as "error"
  useEffect(() => {
    const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    
    const checkStuckDocuments = async () => {
      const { data: stuckDocs } = await supabase
        .from('documents')
        .select('id')
        .eq('status', 'processing')
        .lt('updated_at', new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString());
      
      if (stuckDocs && stuckDocs.length > 0) {
        console.log(`Found ${stuckDocs.length} stuck documents, resetting to error`);
        const ids = stuckDocs.map(d => d.id);
        await supabase
          .from('documents')
          .update({ status: 'error' })
          .in('id', ids);
        fetchData(); // Refresh
      }
    };

    checkStuckDocuments();
    const interval = setInterval(checkStuckDocuments, 60000);
    return () => clearInterval(interval);
  }, []);

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

    if (isArchiveFile(file)) {
      setFormData((prev) => ({
        ...prev,
        name: prev.name || `Архив: ${file.name.replace(/\.[^/.]+$/, "")}`,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        name: prev.name || file.name.replace(/\.[^/.]+$/, ""),
      }));
    }
  };

  // Extract text from file for PII preview
  const extractTextForPreview = async (): Promise<string> => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return "";

    // For text files, read directly
    if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).slice(0, 5000));
        reader.readAsText(file);
      });
    }

    // For PDFs, extract real text using pdfjs-dist
    if (file.type === "application/pdf") {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        
        let text = "";
        const maxPages = Math.min(pdf.numPages, 3); // First 3 pages for preview
        
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
          text += pageText + "\n\n";
        }
        
        const trimmedText = text.trim();
        if (!trimmedText) {
          return `[PDF файл: ${file.name}]\n\nPDF не содержит текстового слоя.\nЕсли это скан, текст будет извлечён через OCR после загрузки документа.`;
        }
        
        return trimmedText.slice(0, 5000);
      } catch (err) {
        console.error("Error extracting PDF text:", err);
        return `[Ошибка извлечения текста из PDF: ${file.name}]`;
      }
    }

    // For DOCX files, extract text using JSZip
    if (file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      try {
        const JSZip = (await import("jszip")).default;
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        const documentXml = await zip.file("word/document.xml")?.async("text");
        if (!documentXml) {
          return `[DOCX файл: ${file.name}]\n\nНе удалось прочитать содержимое документа.`;
        }
        
        // Parse XML and extract text from <w:t> tags
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(documentXml, "text/xml");
        
        const paragraphs: string[] = [];
        const pNodes = xmlDoc.getElementsByTagName("w:p");
        
        for (let i = 0; i < pNodes.length; i++) {
          const textNodes = pNodes[i].getElementsByTagName("w:t");
          let paragraphText = "";
          for (let j = 0; j < textNodes.length; j++) {
            paragraphText += textNodes[j].textContent || "";
          }
          if (paragraphText.trim()) {
            paragraphs.push(paragraphText);
          }
        }
        
        const text = paragraphs.join("\n");
        return text.slice(0, 5000) || `[DOCX файл: ${file.name}]\n\nДокумент не содержит текста.`;
      } catch (err) {
        console.error("Error extracting DOCX text:", err);
        return `[Ошибка извлечения текста из DOCX: ${file.name}]`;
      }
    }

    // For old DOC format - not supported client-side
    if (file.name.endsWith(".doc") || file.type === "application/msword") {
      return `[DOC файл: ${file.name}]\n\nФормат .doc (старый Word) не поддерживает превью на клиенте.\nТекст будет извлечён после загрузки документа на сервер.\n\nРекомендуем сохранить документ в формате .docx для превью.`;
    }

    return `[${file.type || "Неизвестный"} файл: ${file.name}]\n\nПревью недоступно для данного типа файла.`;
  };

  const handlePiiPreview = async () => {
    const text = await extractTextForPreview();
    setPiiPreviewText(text);
    setPiiPreviewOpen(true);
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
    totalParts?: number,
    fileType?: string
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
          file_type: fileType || file.type || 'application/pdf',
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
          contains_pii: !parentId && formData.contains_pii,
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

    // Handle archive files
    if (isArchiveFile(file)) {
      await performArchiveUpload(file);
      return;
    }

    // Check maximum file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Файл слишком большой. Максимальный размер: ${MAX_FILE_SIZE_MB} MB. Ваш файл: ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
      return;
    }

    // Check if PDF needs splitting
    if (file.size > SPLIT_THRESHOLD && file.type === 'application/pdf') {
      const estimated = estimatePdfParts(file.size, PAGES_PER_PART);
      setEstimatedParts(estimated);
      setPendingFile(file);
      setSplitWarningOpen(true);
      return;
    }

    // Check if Excel needs splitting
    if (needsExcelSplit(file)) {
      const estimated = estimateExcelParts(file.size);
      setEstimatedParts(estimated);
      setPendingFile(file);
      setSplitWarningOpen(true);
      return;
    }

    // Regular upload for small files
    await performUpload(file, false);
  };

  const performArchiveUpload = async (archiveFile: File) => {
    setUploading(true);

    try {
      // Extract files from archive
      setUploadProgress({ stage: 'analyzing', message: 'Распаковка архива...', percent: 5 });

      const extractedFiles = await extractArchive(archiveFile, (progress) => {
        setUploadProgress({
          stage: 'analyzing',
          message: progress.message,
          percent: progress.stage === 'complete' ? 15 : 10,
        });
      });

      if (extractedFiles.length === 0) {
        toast.error("Архив не содержит поддерживаемых документов (pdf, docx, txt, csv, xlsx и др.)");
        return;
      }

      toast.info(`Найдено ${extractedFiles.length} документов в архиве. Начинаем загрузку...`);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < extractedFiles.length; i++) {
        const extracted = extractedFiles[i];
        const fileIndex = i + 1;

        setUploadProgress({
          stage: 'uploading',
          currentPart: fileIndex,
          totalParts: extractedFiles.length,
          message: `Загрузка ${fileIndex}/${extractedFiles.length}: ${extracted.name}`,
          percent: 15 + (fileIndex / extractedFiles.length) * 40,
        });

        try {
          const currentFile = extracted.file;

          // Check file size limit
          if (currentFile.size > MAX_FILE_SIZE) {
            console.warn(`Skipping ${extracted.name}: too large (${(currentFile.size / 1024 / 1024).toFixed(1)} MB)`);
            errorCount++;
            continue;
          }

          // Check if PDF needs splitting
          if (currentFile.size > SPLIT_THRESHOLD && currentFile.type === 'application/pdf') {
            const parts = await splitPdf(currentFile, PAGES_PER_PART);
            const partEntries = parts.map(p => ({
              blob: p.blob,
              fileName: generatePartFileName(currentFile.name, p.partNumber, p.totalParts),
              docName: `${extracted.name.replace(/\.[^/.]+$/, '')} (часть ${p.partNumber}/${p.totalParts}, стр. ${p.pageStart}-${p.pageEnd})`,
              partNumber: p.partNumber,
              totalParts: p.totalParts,
            }));

            // Upload and process split parts
            const docIds: string[] = [];
            let parentDocId: string | undefined;

            for (let j = 0; j < partEntries.length; j++) {
              const part = partEntries[j];
              const docId = await uploadSingleFile(
                part.blob, part.fileName, part.docName,
                j === 0 ? undefined : parentDocId,
                part.partNumber, part.totalParts
              );
              if (docId) {
                docIds.push(docId);
                if (j === 0) parentDocId = docId;
              }
            }

            for (const docId of docIds) {
              await processDocument(docId);
            }
            successCount++;
            continue;
          }

          // Check if Excel needs splitting
          if (needsExcelSplit(currentFile)) {
            const parts = await splitExcel(currentFile);
            const partEntries = parts.map(p => ({
              blob: p.blob,
              fileName: generateExcelPartFileName(currentFile.name, p.partNumber, p.totalParts),
              docName: `${extracted.name.replace(/\.[^/.]+$/, '')} (часть ${p.partNumber}/${p.totalParts}, строки ${p.rowStart}-${p.rowEnd})`,
              partNumber: p.partNumber,
              totalParts: p.totalParts,
              fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));

            const docIds: string[] = [];
            let parentDocId: string | undefined;

            for (let j = 0; j < partEntries.length; j++) {
              const part = partEntries[j];
              const docId = await uploadSingleFile(
                part.blob, part.fileName, part.docName,
                j === 0 ? undefined : parentDocId,
                part.partNumber, part.totalParts, part.fileType
              );
              if (docId) {
                docIds.push(docId);
                if (j === 0) parentDocId = docId;
              }
            }

            for (const docId of docIds) {
              await processDocument(docId);
            }
            successCount++;
            continue;
          }

          // Regular file upload
          const docName = extracted.name.replace(/\.[^/.]+$/, '');
          const docId = await uploadSingleFile(currentFile, extracted.name, docName);
          
          if (docId) {
            setUploadProgress({
              stage: 'processing',
              currentPart: fileIndex,
              totalParts: extractedFiles.length,
              message: `Обработка ${fileIndex}/${extractedFiles.length}: ${extracted.name}`,
              percent: 55 + (fileIndex / extractedFiles.length) * 40,
            });

            const success = await processDocument(docId);
            if (success) successCount++;
            else errorCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error(`Error processing ${extracted.name}:`, err);
          errorCount++;
        }
      }

      setUploadProgress({ stage: 'complete', message: 'Готово!', percent: 100 });

      if (errorCount === 0) {
        toast.success(`Все ${successCount} документов из архива загружены и обработаны`);
      } else {
        toast.warning(`Загружено ${successCount} из ${extractedFiles.length} документов. Ошибок: ${errorCount}`);
      }

      // Reset form
      setUploadDialogOpen(false);
      setFormData({ name: "", folder_id: "", document_type: "auto", has_trademark: false, contains_pii: false });
      setTrademarkFile(null);
      setTrademarkPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (trademarkInputRef.current) trademarkInputRef.current.value = "";
      fetchData();
    } catch (error: any) {
      console.error("Error extracting archive:", error);
      toast.error(error.message || "Ошибка распаковки архива");
    } finally {
      setUploading(false);
      setTimeout(() => {
        setUploadProgress({ stage: 'idle', message: '', percent: 0 });
      }, 2000);
    }
  };

  const performUpload = async (file: File, needsSplit: boolean) => {
    setUploading(true);
    setSplitWarningOpen(false);
    setPendingFile(null);

    try {
      const isExcel = needsExcelSplit(file);
      
      if (needsSplit && file.type === 'application/pdf') {
        await performPdfSplitUpload(file);
      } else if (needsSplit && isExcel) {
        await performExcelSplitUpload(file);
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
      setFormData({ name: "", folder_id: "", document_type: "auto", has_trademark: false, contains_pii: false });
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

  const performPdfSplitUpload = async (file: File) => {
    setUploadProgress({ stage: 'analyzing', message: 'Анализ PDF...', percent: 5 });
    
    const pageCount = await getPdfPageCount(file);
    const actualParts = Math.ceil(pageCount / PAGES_PER_PART);
    
    setUploadProgress({ 
      stage: 'splitting', 
      message: `Разбиение на ${actualParts} частей...`, 
      percent: 10 
    });
    
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

    await uploadAndProcessParts(
      parts.map(p => ({
        blob: p.blob,
        fileName: generatePartFileName(file.name, p.partNumber, p.totalParts),
        docName: `${formData.name} (часть ${p.partNumber}/${p.totalParts}, стр. ${p.pageStart}-${p.pageEnd})`,
        partNumber: p.partNumber,
        totalParts: p.totalParts,
      }))
    );
  };

  const performExcelSplitUpload = async (file: File) => {
    setUploadProgress({ stage: 'analyzing', message: 'Анализ Excel...', percent: 5 });
    
    const parts = await splitExcel(file, 5000, (progress: ExcelSplitProgress) => {
      if (progress.stage === 'splitting') {
        const percent = 10 + (progress.currentPart / progress.totalParts) * 30;
        setUploadProgress({
          stage: 'splitting',
          currentPart: progress.currentPart,
          totalParts: progress.totalParts,
          message: `Разбиение Excel: часть ${progress.currentPart} из ${progress.totalParts}`,
          percent,
        });
      }
    });

    await uploadAndProcessParts(
      parts.map(p => ({
        blob: p.blob,
        fileName: generateExcelPartFileName(file.name, p.partNumber, p.totalParts),
        docName: `${formData.name} (часть ${p.partNumber}/${p.totalParts}, строки ${p.rowStart}-${p.rowEnd})`,
        partNumber: p.partNumber,
        totalParts: p.totalParts,
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }))
    );
  };

  const uploadAndProcessParts = async (parts: Array<{
    blob: Blob;
    fileName: string;
    docName: string;
    partNumber: number;
    totalParts: number;
    fileType?: string;
  }>) => {
    const docIds: string[] = [];
    let parentDocId: string | undefined = undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      setUploadProgress({
        stage: 'uploading',
        currentPart: i + 1,
        totalParts: parts.length,
        message: `Загрузка части ${i + 1} из ${parts.length}...`,
        percent: 40 + ((i + 1) / parts.length) * 30,
      });

      const docId = await uploadSingleFile(
        part.blob,
        part.fileName,
        part.docName,
        i === 0 ? undefined : parentDocId,
        part.partNumber,
        part.totalParts,
        part.fileType
      );
      
      if (docId) {
        docIds.push(docId);
        if (i === 0) parentDocId = docId;
      }
    }

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

  // Handle delete entire document group (all parts)
  const handleDeleteGroup = (group: DocumentGroup) => {
    setPendingDeleteGroup(group);
    setDeleteGroupDialogOpen(true);
  };

  const confirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) return;
    
    setDeletingGroup(true);
    
    try {
      const docsToDelete = pendingDeleteGroup.documents;
      const parentDoc = pendingDeleteGroup.parentDocument;
      
      // Collect all storage paths
      const storagePaths: string[] = [];
      const docIds: string[] = [];
      
      for (const doc of docsToDelete) {
        if (doc.storage_path) {
          storagePaths.push(doc.storage_path);
        }
        docIds.push(doc.id);
      }
      
      // Also include parent document if exists
      if (parentDoc) {
        if (parentDoc.storage_path) {
          storagePaths.push(parentDoc.storage_path);
        }
        docIds.push(parentDoc.id);
      }
      
      // Delete files from storage
      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("rag-documents")
          .remove(storagePaths);
        
        if (storageError) {
          console.error("Storage delete error:", storageError);
          // Continue anyway - DB records are more important
        }
      }
      
      // Delete document records (cascade will delete chunks)
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .in("id", docIds);
      
      if (deleteError) throw deleteError;
      
      toast.success(`Удалено ${docIds.length} документов (все части)`);
      setDeleteGroupDialogOpen(false);
      setPendingDeleteGroup(null);
      fetchData();
    } catch (error: any) {
      console.error("Error deleting document group:", error);
      toast.error(error.message || "Ошибка удаления группы документов");
    } finally {
      setDeletingGroup(false);
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
    if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
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

  // Handle upload missing parts
  const handleUploadMissingParts = (info: MissingPartsInfo) => {
    setMissingPartsInfo(info);
    setMissingPartsDialogOpen(true);
  };

  const handleMissingPartsFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !missingPartsInfo) return;

    if (file.type !== 'application/pdf') {
      toast.error("Выберите PDF файл");
      return;
    }

    setUploading(true);
    setMissingPartsDialogOpen(false);

    try {
      setUploadProgress({ stage: 'analyzing', message: 'Анализ PDF...', percent: 5 });
      
      const pageCount = await getPdfPageCount(file);
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

      // Filter to only missing parts
      const missingPartNumbers = new Set(missingPartsInfo.missingParts);
      const partsToUpload = parts.filter(p => missingPartNumbers.has(p.partNumber));

      if (partsToUpload.length === 0) {
        toast.error("В выбранном файле нет недостающих частей");
        setUploading(false);
        setUploadProgress({ stage: 'idle', message: '', percent: 0 });
        return;
      }

      toast.info(`Найдено ${partsToUpload.length} недостающих частей для загрузки`);

      // Upload missing parts
      const docIds: string[] = [];
      for (let i = 0; i < partsToUpload.length; i++) {
        const part = partsToUpload[i];
        const partFileName = generatePartFileName(file.name, part.partNumber, missingPartsInfo.expectedParts);
        const partDocName = `${missingPartsInfo.baseName} (часть ${part.partNumber}/${missingPartsInfo.expectedParts}, стр. ${part.pageStart}-${part.pageEnd})`;
        
        setUploadProgress({
          stage: 'uploading',
          currentPart: i + 1,
          totalParts: partsToUpload.length,
          message: `Загрузка части ${part.partNumber} (${i + 1} из ${partsToUpload.length})...`,
          percent: 40 + ((i + 1) / partsToUpload.length) * 30,
        });

        // Upload with parent link
        const docId = await uploadMissingPart(
          part.blob,
          partFileName,
          partDocName,
          missingPartsInfo.parentDocumentId,
          part.partNumber,
          missingPartsInfo.expectedParts,
          missingPartsInfo.folderId,
          missingPartsInfo.documentType
        );
        
        if (docId) {
          docIds.push(docId);
        }
      }

      // Process uploaded parts
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
        toast.success(`Успешно загружено и обработано ${docIds.length} недостающих частей`);
      } else {
        toast.warning(`Загружено ${docIds.length} частей. Успешно обработано: ${successCount}`);
      }

      fetchData();
    } catch (error: any) {
      console.error("Error uploading missing parts:", error);
      toast.error(error.message || "Ошибка загрузки недостающих частей");
    } finally {
      setUploading(false);
      setMissingPartsInfo(null);
      if (missingPartsFileInputRef.current) {
        missingPartsFileInputRef.current.value = "";
      }
      setTimeout(() => {
        setUploadProgress({ stage: 'idle', message: '', percent: 0 });
      }, 2000);
    }
  };

  // Upload a single missing part
  const uploadMissingPart = async (
    file: Blob,
    fileName: string,
    docName: string,
    parentId: string | null,
    partNumber: number,
    totalParts: number,
    folderId: string | null,
    documentType: string | null
  ): Promise<string | null> => {
    try {
      const sanitizedName = sanitizeFileName(fileName);
      const storagePath = `${Date.now()}-${sanitizedName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("rag-documents")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          name: docName,
          file_name: fileName,
          file_type: 'application/pdf',
          file_size: file.size,
          storage_path: storagePath,
          folder_id: folderId,
          document_type: documentType || 'auto',
          status: "pending",
          parent_document_id: parentId,
          part_number: partNumber,
          total_parts: totalParts,
        })
        .select()
        .single();

      if (docError) throw docError;

      return doc.id;
    } catch (error) {
      console.error("Error uploading missing part:", error);
      throw error;
    }
  };

  // Move/Copy handlers
  const openMoveDialog = (doc: Document, mode: "move" | "copy") => {
    setMoveTargetDoc(doc);
    setMoveTargetGroup(null);
    setMoveDialogMode(mode);
    setMoveDialogOpen(true);
  };

  const openMoveGroupDialog = (group: DocumentGroup, mode: "move" | "copy") => {
    setMoveTargetDoc(null);
    setMoveTargetGroup(group);
    setMoveDialogMode(mode);
    setMoveDialogOpen(true);
  };

  const handleMoveOrCopyConfirm = async (targetFolderId: string) => {
    setMovingDoc(true);
    try {
      if (moveDialogMode === "move") {
        if (moveTargetGroup) {
          // Move all parts in group
          const ids = moveTargetGroup.documents.map((d) => d.id);
          if (moveTargetGroup.parentDocument) ids.push(moveTargetGroup.parentDocument.id);
          const { error } = await supabase
            .from("documents")
            .update({ folder_id: targetFolderId })
            .in("id", ids);
          if (error) throw error;
          toast.success(`Перенесено ${ids.length} документов`);
        } else if (moveTargetDoc) {
          // Move single doc + its children
          const idsToMove = [moveTargetDoc.id];
          // Find children (parts that reference this doc as parent)
          const children = documents.filter((d) => d.parent_document_id === moveTargetDoc.id);
          children.forEach((c) => idsToMove.push(c.id));
          const { error } = await supabase
            .from("documents")
            .update({ folder_id: targetFolderId })
            .in("id", idsToMove);
          if (error) throw error;
          toast.success("Документ перенесён");
        }
      } else {
        // Copy
        if (moveTargetGroup) {
          // Copy entire group with new parent chain
          const parentDoc = moveTargetGroup.parentDocument;
          const childDocs = moveTargetGroup.documents;
          
          let newParentId: string | null = null;
          
          // Copy parent document first if it exists
          if (parentDoc) {
            newParentId = await copyDocumentToFolder(parentDoc, targetFolderId, null);
          }
          
          // Copy child documents, pointing to new parent
          for (const srcDoc of childDocs) {
            // If this doc was pointing to old parent, point to new parent
            const overrideParentId = srcDoc.parent_document_id ? newParentId : null;
            await copyDocumentToFolder(srcDoc, targetFolderId, overrideParentId);
          }
          
          toast.success(`Скопировано ${childDocs.length + (parentDoc ? 1 : 0)} документ(ов)`);
        } else if (moveTargetDoc) {
          await copyDocumentToFolder(moveTargetDoc, targetFolderId, null);
          toast.success("Документ скопирован");
        }
      }

      setMoveDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error("Move/copy error:", error);
      toast.error(error.message || "Ошибка операции");
    } finally {
      setMovingDoc(false);
    }
  };

  const copyDocumentToFolder = async (srcDoc: Document, targetFolderId: string) => {
    // 1. Create new document record
    const { data: newDoc, error: docErr } = await supabase
      .from("documents")
      .insert({
        name: srcDoc.name,
        file_name: srcDoc.file_name,
        file_type: srcDoc.file_type,
        file_size: srcDoc.file_size,
        storage_path: srcDoc.storage_path,
        folder_id: targetFolderId,
        document_type: srcDoc.document_type,
        status: srcDoc.status,
        chunk_count: srcDoc.chunk_count,
        has_trademark: srcDoc.has_trademark,
        trademark_image_path: srcDoc.trademark_image_path,
        parent_document_id: srcDoc.parent_document_id,
        part_number: srcDoc.part_number,
        total_parts: srcDoc.total_parts,
      })
      .select()
      .single();

    if (docErr) throw docErr;

    // 2. Copy chunks in batches
    let offset = 0;
    const batchSize = 500;
    while (true) {
      const { data: chunks, error: chunkErr } = await supabase
        .from("document_chunks")
        .select("content, chunk_index, embedding, metadata, section_title, article_number, chunk_type, page_start, page_end, has_masked_pii, content_tsv")
        .eq("document_id", srcDoc.id)
        .range(offset, offset + batchSize - 1)
        .order("chunk_index");

      if (chunkErr) throw chunkErr;
      if (!chunks || chunks.length === 0) break;

      const newChunks = chunks.map((c) => ({
        document_id: newDoc.id,
        content: c.content,
        chunk_index: c.chunk_index,
        embedding: c.embedding,
        metadata: c.metadata,
        section_title: c.section_title,
        article_number: c.article_number,
        chunk_type: c.chunk_type,
        page_start: c.page_start,
        page_end: c.page_end,
        has_masked_pii: c.has_masked_pii,
      }));

      const { error: insertErr } = await supabase
        .from("document_chunks")
        .insert(newChunks);
      if (insertErr) throw insertErr;

      if (chunks.length < batchSize) break;
      offset += batchSize;
    }
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
                  accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.zip,.rar,.7z,.tar,.tar.gz,.tgz"
                  onChange={handleFileSelect}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Поддерживаются: PDF (до {MAX_FILE_SIZE_MB} MB), DOC, DOCX, TXT, MD, CSV, XLS, XLSX.
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

              {/* PII checkbox */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="contains_pii"
                    checked={formData.contains_pii}
                    onCheckedChange={(checked) => {
                      setFormData((prev) => ({ ...prev, contains_pii: !!checked }));
                    }}
                  />
                  <Label htmlFor="contains_pii" className="font-normal cursor-pointer flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-500" />
                    Документ содержит персональные данные (152-ФЗ)
                  </Label>
                </div>

                {formData.contains_pii && (
                  <div className="pl-6 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      ПДн будут автоматически замаскированы перед отправкой в AI.
                      Оригиналы доступны только пользователям с соответствующими правами.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePiiPreview}
                      disabled={!fileInputRef.current?.files?.[0]}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Превью маскирования
                    </Button>
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
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "tree" | "table")}>
                <TabsList className="h-9">
                  <TabsTrigger value="tree" className="px-3">
                    <LayoutGrid className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="table" className="px-3">
                    <LayoutList className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
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
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "tree" ? (
            <DocumentTree
              documents={documents.map(doc => ({
                ...doc,
                parent_document_id: doc.parent_document_id || null,
                part_number: doc.part_number || null,
                total_parts: doc.total_parts || null,
              }))}
              folders={folders}
              onReprocess={handleReprocess}
              onViewChunks={handleViewChunks}
              onDelete={handleDelete}
              onDeleteGroup={handleDeleteGroup}
              onUploadMissingParts={handleUploadMissingParts}
              onMove={(doc) => openMoveDialog(doc, "move")}
              onCopy={(doc) => openMoveDialog(doc, "copy")}
              onMoveGroup={(group) => openMoveGroupDialog(group, "move")}
              onCopyGroup={(group) => openMoveGroupDialog(group, "copy")}
              formatFileSize={formatFileSize}
            />
          ) : documents.length === 0 ? (
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
                                  disabled={doc.status === "processing" || (doc.file_size != null && doc.file_size > 10 * 1024 * 1024)}
                                  title="Переобработать"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              {doc.file_size != null && doc.file_size > 10 * 1024 * 1024 && (
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

      {/* Missing parts upload dialog */}
      <Dialog open={missingPartsDialogOpen} onOpenChange={setMissingPartsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Дозагрузить недостающие части</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {missingPartsInfo && (
              <>
                <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                  <p className="font-medium">{missingPartsInfo.baseName}</p>
                  <p className="text-sm text-muted-foreground">
                    Загружено: {missingPartsInfo.existingParts.length} из {missingPartsInfo.expectedParts} частей
                  </p>
                  <p className="text-sm text-orange-600">
                    Недостающие части: {missingPartsInfo.missingParts.slice(0, 10).join(', ')}
                    {missingPartsInfo.missingParts.length > 10 ? ` и ещё ${missingPartsInfo.missingParts.length - 10}...` : ''}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Выберите исходный PDF файл</Label>
                  <Input
                    type="file"
                    ref={missingPartsFileInputRef}
                    accept=".pdf"
                    onChange={handleMissingPartsFileSelect}
                  />
                  <p className="text-xs text-muted-foreground">
                    Система автоматически разобьёт файл и загрузит только недостающие части.
                  </p>
                </div>
              </>
            )}
            
            {uploading && uploadProgress.stage !== 'idle' && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">{uploadProgress.message}</span>
                </div>
                <Progress value={uploadProgress.percent} className="h-2" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation Dialog */}
      <AlertDialog open={deleteGroupDialogOpen} onOpenChange={setDeleteGroupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Удалить все части документа?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {pendingDeleteGroup && (
                <>
                  <p>
                    Будет удалено <strong>{pendingDeleteGroup.documents.length} частей</strong> документа
                    {pendingDeleteGroup.parentDocument && ` и родительский документ`}.
                  </p>
                  <div className="rounded-lg border bg-muted/50 p-3 mt-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Всего файлов:</span>
                      <span className="font-medium">
                        {pendingDeleteGroup.documents.length + (pendingDeleteGroup.parentDocument ? 1 : 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Размер:</span>
                      <span className="font-medium">
                        {formatFileSize(
                          pendingDeleteGroup.documents.reduce((sum, d) => sum + (d.file_size || 0), 0) +
                          (pendingDeleteGroup.parentDocument?.file_size || 0)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Чанков:</span>
                      <span className="font-medium">
                        {pendingDeleteGroup.documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0) +
                          (pendingDeleteGroup.parentDocument?.chunk_count || 0)}
                      </span>
                    </div>
                  </div>
                  <p className="text-destructive font-medium mt-2">
                    Это действие нельзя отменить. Файлы и индексы будут удалены безвозвратно.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingGroup}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteGroup}
              disabled={deletingGroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingGroup ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить всё"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PII Preview Dialog */}
      <PiiPreviewDialog
        open={piiPreviewOpen}
        onOpenChange={setPiiPreviewOpen}
        text={piiPreviewText}
        fileName={formData.name || fileInputRef.current?.files?.[0]?.name || "документ"}
      />

      {/* Move/Copy Document Dialog */}
      <MoveDocumentDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        mode={moveDialogMode}
        folders={folders}
        currentFolderId={
          moveTargetGroup
            ? (moveTargetGroup.parentDocument || moveTargetGroup.documents[0])?.folder_id || null
            : moveTargetDoc?.folder_id || null
        }
        documentName={
          moveTargetGroup
            ? (moveTargetGroup.parentDocument || moveTargetGroup.documents[0])?.name || ""
            : moveTargetDoc?.name || ""
        }
        loading={movingDoc}
        onConfirm={handleMoveOrCopyConfirm}
      />
    </div>
  );
}
