import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { DocumentService } from 'src/services/document/document.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file')) // Обробляє multipart/form-data
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // Валідація: файл обов'язковий
    if (!file) {
      throw new HttpException('File is required', HttpStatus.BAD_REQUEST);
    }

    // Валідація: поки підтримуємо тільки .txt
    if (!file.originalname.endsWith('.txt')) {
      throw new HttpException(
        'Only .txt files are supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Multer зберігає файл в buffer — конвертуємо в string
    const content = file.buffer.toString('utf-8');

    const result = await this.documentService.processTextFile(
      content,
      file.originalname,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get()
  async listDocuments() {
    const documents = await this.documentService.listDocuments();
    return { success: true, data: documents };
  }

  @Delete(':filename')
  async deleteDocument(@Param('filename') filename: string) {
    await this.documentService.deleteDocument(filename);
    return { success: true, data: { message: `Document "${filename}" deleted` } };
  }
}
