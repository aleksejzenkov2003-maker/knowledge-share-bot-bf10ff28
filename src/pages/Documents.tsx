import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { Plus, Upload, FileText, Trash2, Eye, Loader2 } from "lucide-react";

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
  created_at: string;
  folder?: DocumentFolder | null;
}

interface DocumentChunk {
  id: string;
  content: string;
  chunk_index: number;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидает", variant: "outline" },
  processing: { label: "Обработка", variant: "secondary" },
  ready: { label: "Готов", variant: "default" },
  error: { label: "Ошибка", variant: "destructive" },
};

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

  const [formData, setFormData] = useState({
    name: "",
    folder_id: "",
  });

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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Выберите файл");
      return;
    }

    setUploading(true);

    try {
      // Upload file to storage
      const fileName = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("rag-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          name: formData.name,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: fileName,
          folder_id: formData.folder_id || null,
          status: "pending",
        })
        .select()
        .single();

      if (docError) throw docError;

      toast.success("Документ загружен");

      // Trigger processing
      try {
        const { error: processError } = await supabase.functions.invoke("process-document", {
          body: { document_id: doc.id },
        });

        if (processError) {
          console.error("Processing error:", processError);
          toast.warning("Документ загружен, но обработка не запущена");
        }
      } catch (err) {
        console.error("Processing invocation error:", err);
      }

      setUploadDialogOpen(false);
      setFormData({ name: "", folder_id: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchData();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast.error(error.message || "Ошибка загрузки");
    } finally {
      setUploading(false);
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
            Загрузка и управление документами для RAG
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
                  Поддерживаются: PDF, DOC, DOCX, TXT, MD
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
                  value={formData.folder_id}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, folder_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите папку" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Без папки</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUploadDialogOpen(false)}
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Список документов</CardTitle>
              <CardDescription>
                Всего документов: {documents.length}
              </CardDescription>
            </div>
            <Select value={filterFolder} onValueChange={setFilterFolder}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Все папки" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все папки</SelectItem>
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
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {doc.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {doc.file_name || "-"}
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
