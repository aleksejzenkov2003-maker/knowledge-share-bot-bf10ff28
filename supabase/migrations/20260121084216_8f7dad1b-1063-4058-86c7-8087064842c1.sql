-- Добавляем поле для типа документа
ALTER TABLE documents 
ADD COLUMN document_type text DEFAULT 'auto';

-- Добавляем комментарий с допустимыми значениями
COMMENT ON COLUMN documents.document_type IS 
'Тип документа: auto, legal, court, registration_decision, contract, business, general';