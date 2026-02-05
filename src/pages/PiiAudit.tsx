 import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { format } from "date-fns";
 import { ru } from "date-fns/locale";
 import {
   Shield,
   Eye,
   Download,
   Copy,
   User,
   Calendar,
   FileText,
   MessageSquare,
   RefreshCw,
   TrendingUp,
   AlertTriangle,
 } from "lucide-react";
 import { supabase } from "@/integrations/supabase/client";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
 } from "@/components/ui/table";
 import { Skeleton } from "@/components/ui/skeleton";
 
 // Human-readable labels for PII types
 const PII_TYPE_LABELS: Record<string, string> = {
   PASSPORT: "Паспорт",
   SNILS: "СНИЛС",
   INN: "ИНН",
   INN_ORG: "ИНН орг.",
   CARD: "Карта",
   ACCOUNT: "Счёт",
   PHONE: "Телефон",
   EMAIL: "Email",
   BIRTHDATE: "Дата рождения",
   ADDRESS: "Адрес",
   PERSON: "ФИО",
 };
 
 const ACTION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
   view: { label: "Просмотр", icon: <Eye className="h-4 w-4" /> },
   export: { label: "Экспорт", icon: <Download className="h-4 w-4" /> },
   copy: { label: "Копирование", icon: <Copy className="h-4 w-4" /> },
 };
 
 const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
   chat_message: { label: "Сообщение", icon: <MessageSquare className="h-4 w-4" /> },
   document_chunk: { label: "Документ", icon: <FileText className="h-4 w-4" /> },
   document: { label: "Документ", icon: <FileText className="h-4 w-4" /> },
   attachment: { label: "Вложение", icon: <FileText className="h-4 w-4" /> },
 };
 
 interface AuditLogEntry {
   id: string;
   user_id: string;
   user_email: string | null;
   user_ip: string | null;
   token: string;
   pii_type: string;
   action: string;
   source_type: string;
   source_id: string;
   created_at: string;
 }
 
 interface PiiStats {
   totalAccess: number;
   uniqueUsers: number;
   byType: Record<string, number>;
   byAction: Record<string, number>;
   recentTrend: number;
 }
 
 export default function PiiAudit() {
   const [searchTerm, setSearchTerm] = useState("");
   const [filterType, setFilterType] = useState<string>("all");
   const [filterAction, setFilterAction] = useState<string>("all");
 
   // Fetch audit log entries
   const { data: auditLogs, isLoading: logsLoading, refetch } = useQuery({
     queryKey: ["pii-audit-logs", filterType, filterAction],
     queryFn: async () => {
       let query = supabase
         .from("pii_audit_log")
         .select("*")
         .order("created_at", { ascending: false })
         .limit(100);
 
       if (filterType !== "all") {
         query = query.eq("pii_type", filterType);
       }
       if (filterAction !== "all") {
         query = query.eq("action", filterAction);
       }
 
       const { data, error } = await query;
       if (error) throw error;
       return data as AuditLogEntry[];
     },
   });
 
   // Calculate statistics
   const stats: PiiStats | null = auditLogs
     ? {
         totalAccess: auditLogs.length,
         uniqueUsers: new Set(auditLogs.map((log) => log.user_id)).size,
         byType: auditLogs.reduce((acc, log) => {
           acc[log.pii_type] = (acc[log.pii_type] || 0) + 1;
           return acc;
         }, {} as Record<string, number>),
         byAction: auditLogs.reduce((acc, log) => {
           acc[log.action] = (acc[log.action] || 0) + 1;
           return acc;
         }, {} as Record<string, number>),
         recentTrend: auditLogs.filter((log) => {
           const logDate = new Date(log.created_at);
           const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
           return logDate > dayAgo;
         }).length,
       }
     : null;
 
   // Filter logs by search term
   const filteredLogs = auditLogs?.filter((log) => {
     if (!searchTerm) return true;
     const search = searchTerm.toLowerCase();
     return (
       log.user_email?.toLowerCase().includes(search) ||
       log.token.toLowerCase().includes(search) ||
       log.user_ip?.toLowerCase().includes(search)
     );
   });
 
   return (
     <div className="space-y-6">
       {/* Header */}
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
           <div>
             <h1 className="text-2xl font-bold">Аудит персональных данных</h1>
             <p className="text-muted-foreground">
               Журнал доступа к ПДн в соответствии с 152-ФЗ
             </p>
           </div>
         </div>
         <Button variant="outline" onClick={() => refetch()} className="gap-2">
           <RefreshCw className="h-4 w-4" />
           Обновить
         </Button>
       </div>
 
       {/* Statistics Cards */}
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Всего запросов</CardTitle>
             <Eye className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             {logsLoading ? (
               <Skeleton className="h-8 w-20" />
             ) : (
               <div className="text-2xl font-bold">{stats?.totalAccess || 0}</div>
             )}
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Уникальных пользователей</CardTitle>
             <User className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             {logsLoading ? (
               <Skeleton className="h-8 w-20" />
             ) : (
               <div className="text-2xl font-bold">{stats?.uniqueUsers || 0}</div>
             )}
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">За последние 24ч</CardTitle>
             <TrendingUp className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             {logsLoading ? (
               <Skeleton className="h-8 w-20" />
             ) : (
               <div className="text-2xl font-bold">{stats?.recentTrend || 0}</div>
             )}
           </CardContent>
         </Card>
 
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium">Типов ПДн</CardTitle>
             <Shield className="h-4 w-4 text-muted-foreground" />
           </CardHeader>
           <CardContent>
             {logsLoading ? (
               <Skeleton className="h-8 w-20" />
             ) : (
               <div className="text-2xl font-bold">
                 {Object.keys(stats?.byType || {}).length}
               </div>
             )}
           </CardContent>
         </Card>
       </div>
 
       {/* PII Type Distribution */}
       {stats && Object.keys(stats.byType).length > 0 && (
         <Card>
           <CardHeader>
             <CardTitle className="text-lg">Распределение по типам ПДн</CardTitle>
             <CardDescription>Количество обращений к каждому типу персональных данных</CardDescription>
           </CardHeader>
           <CardContent>
             <div className="flex flex-wrap gap-2">
               {Object.entries(stats.byType)
                 .sort((a, b) => b[1] - a[1])
                 .map(([type, count]) => (
                   <Badge
                     key={type}
                     variant="secondary"
                    className="gap-1 bg-accent text-accent-foreground"
                   >
                     {PII_TYPE_LABELS[type] || type}: {count}
                   </Badge>
                 ))}
             </div>
           </CardContent>
         </Card>
       )}
 
       {/* Filters */}
       <Card>
         <CardHeader>
           <CardTitle className="text-lg">Журнал доступа</CardTitle>
           <CardDescription>
             Все операции восстановления персональных данных
           </CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
           <div className="flex flex-wrap gap-4">
             <Input
               placeholder="Поиск по email, IP или токену..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="max-w-sm"
             />
             <Select value={filterType} onValueChange={setFilterType}>
               <SelectTrigger className="w-[180px]">
                 <SelectValue placeholder="Тип ПДн" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">Все типы</SelectItem>
                 {Object.entries(PII_TYPE_LABELS).map(([value, label]) => (
                   <SelectItem key={value} value={value}>
                     {label}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
             <Select value={filterAction} onValueChange={setFilterAction}>
               <SelectTrigger className="w-[180px]">
                 <SelectValue placeholder="Действие" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">Все действия</SelectItem>
                 <SelectItem value="view">Просмотр</SelectItem>
                 <SelectItem value="export">Экспорт</SelectItem>
                 <SelectItem value="copy">Копирование</SelectItem>
               </SelectContent>
             </Select>
           </div>
 
           {/* Audit Log Table */}
           <div className="rounded-md border">
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Дата/время</TableHead>
                   <TableHead>Пользователь</TableHead>
                   <TableHead>Действие</TableHead>
                   <TableHead>Тип ПДн</TableHead>
                   <TableHead>Токен</TableHead>
                   <TableHead>Источник</TableHead>
                   <TableHead>IP</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {logsLoading ? (
                   Array.from({ length: 5 }).map((_, i) => (
                     <TableRow key={i}>
                       <TableCell colSpan={7}>
                         <Skeleton className="h-8 w-full" />
                       </TableCell>
                     </TableRow>
                   ))
                 ) : filteredLogs && filteredLogs.length > 0 ? (
                   filteredLogs.map((log) => (
                     <TableRow key={log.id}>
                       <TableCell className="whitespace-nowrap">
                         <div className="flex items-center gap-2">
                           <Calendar className="h-4 w-4 text-muted-foreground" />
                           {format(new Date(log.created_at), "dd.MM.yyyy HH:mm", {
                             locale: ru,
                           })}
                         </div>
                       </TableCell>
                       <TableCell>
                         <div className="flex items-center gap-2">
                           <User className="h-4 w-4 text-muted-foreground" />
                           <span className="text-sm">
                             {log.user_email || log.user_id.slice(0, 8)}
                           </span>
                         </div>
                       </TableCell>
                       <TableCell>
                         <Badge variant="outline" className="gap-1">
                           {ACTION_LABELS[log.action]?.icon}
                           {ACTION_LABELS[log.action]?.label || log.action}
                         </Badge>
                       </TableCell>
                       <TableCell>
                         <Badge
                           variant="secondary"
                         className="bg-accent text-accent-foreground"
                         >
                           {PII_TYPE_LABELS[log.pii_type] || log.pii_type}
                         </Badge>
                       </TableCell>
                       <TableCell>
                         <code className="text-xs bg-muted px-1 py-0.5 rounded">
                           {log.token}
                         </code>
                       </TableCell>
                       <TableCell>
                         <div className="flex items-center gap-1">
                           {SOURCE_TYPE_LABELS[log.source_type]?.icon}
                           <span className="text-sm">
                             {SOURCE_TYPE_LABELS[log.source_type]?.label || log.source_type}
                           </span>
                         </div>
                       </TableCell>
                       <TableCell>
                         <span className="text-xs text-muted-foreground font-mono">
                           {log.user_ip || "—"}
                         </span>
                       </TableCell>
                     </TableRow>
                   ))
                 ) : (
                   <TableRow>
                     <TableCell colSpan={7} className="text-center py-8">
                       <div className="flex flex-col items-center gap-2 text-muted-foreground">
                         <AlertTriangle className="h-8 w-8" />
                         <p>Записи аудита отсутствуют</p>
                         <p className="text-sm">
                           Журнал будет заполняться при восстановлении ПДн
                         </p>
                       </div>
                     </TableCell>
                   </TableRow>
                 )}
               </TableBody>
             </Table>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }