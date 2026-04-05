-- Добавляем поля для товарного знака в документы
ALTER TABLE documents 
ADD COLUMN has_trademark boolean DEFAULT false,
ADD COLUMN trademark_image_path text;

COMMENT ON COLUMN documents.has_trademark IS 'Есть ли изображение товарного знака';
COMMENT ON COLUMN documents.trademark_image_path IS 'Путь к изображению товарного знака в storage';