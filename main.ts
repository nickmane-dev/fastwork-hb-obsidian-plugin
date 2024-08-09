// Импортируем необходимые модули
import { Plugin, TFile, Modal, App, ButtonComponent, MarkdownView, Notice, Vault } from 'obsidian';
import moment from 'moment';

// Основной класс плагина
export default class SimilarNotesPlugin extends Plugin {

    async onload() {
        // Создаем кнопку на панели, при нажатии на которую откроется модальное окно
        const ribbonIconEl = this.addRibbonIcon('magnifying-glass', 'Показать похожие заметки', () => {
            this.showSimilarNotesModal();
        });
        ribbonIconEl.addClass('similar-notes-ribbon-icon');
    }

    // Метод, вызываемый при нажатии на кнопку
    async showSimilarNotesModal() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        const activeWords = this.extractWords(activeFile.basename);
        const similarNotes = this.findSimilarNotes(activeWords, activeFile.path);

        new SimilarNotesModal(this.app, similarNotes, this, activeFile).open();
    }

    // Метод для поиска заметок с похожими заголовками
    findSimilarNotes(sourceWords: string[], currentFilePath: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            const fileWords = this.extractWords(file.basename);

            return file.path !== currentFilePath && this.containsAllWords(sourceWords, fileWords);            
        });
    }

    // Метод для извлечения слов из строки (удаляет символы и приводит к нижнему регистру)
    extractWords(title: string): string[] {
        return title
            .toLowerCase()
            .replace(/[^а-яА-ЯёЁa-zA-Z\s]/g, '') // Удаляем все неалфавитные символы, оставляя только буквы и пробелы
            .split(/\s+/) // Разделяем строку по пробелам
            .filter(word => word.length > 0); // Удаляем пустые строки
    }

    // Метод для проверки, содержатся ли все слова из одного списка в другом
    containsAllWords(sourceWords: string[], targetWords: string[]): boolean {
        return (sourceWords.every(word => targetWords.includes(word))) && sourceWords.length == targetWords.length;
    }

    // Метод для замены ссылок на изображения
    async fixImageLinks() {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
            const editor = markdownView.editor;
            const content = editor.getValue();

            // Регулярное выражение для поиска ссылок на изображения
            const updatedContent = content.replace(/!\[\[(.*?)(\d{14}.*?\.\w+)\]\]/g, (match, p1, p2) => {
                return `![[Pasted image ${p2}]]`;
            });

            if (updatedContent !== content) {
                editor.setValue(updatedContent);
                new Notice('Ссылки на изображения обновлены.');
            } else {
                new Notice('Ссылки на изображения не найдены или не требуют замены.');
            }
        }
    }

    // Метод для копирования и вставки контента
    async copyAndPasteContent(sourceFile: TFile, targetFiles: TFile[]) {
        const sourceContent = await this.app.vault.read(sourceFile);

        for (const file of targetFiles) {
            if (file.path !== sourceFile.path) {
                try {
                    // Обновляем содержимое целевого файла
                    await this.app.vault.modify(file, sourceContent);
                    
                    // Переименовываем файл после копирования, если требуется
                    await this.renameFile(file, `${sourceFile.basename}`);

                    new Notice(`Содержимое скопировано и файл переименован в ${file.path}`);
                } catch (error) {
                    new Notice(`Ошибка при обновлении содержимого: ${error.message}`);
                }
            }
        }
    }

    // Метод для переименования файла
    async renameFile(file: TFile, newName: string) {
        try {
            const newPath = `${file.parent.path}/${newName}.md`;
            await this.app.vault.rename(file, newPath);
            new Notice(`Файл переименован в ${newName}`);
        } catch (error) {
            new Notice(`Ошибка при переименовании файла: ${error.message}`);
        }
    }
}

// Класс для модального окна с подтверждением копирования контента
class ConfirmCopyModal extends Modal {
    plugin: SimilarNotesPlugin;
    sourceFile: TFile;
    targetFiles: TFile[];

    constructor(app: App, plugin: SimilarNotesPlugin, sourceFile: TFile, targetFiles: TFile[]) {
        super(app);
        this.plugin = plugin;
        this.sourceFile = sourceFile;
        this.targetFiles = targetFiles;
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Подтверждение копирования' });
        contentEl.createEl('p', { text: `Вы уверены, что хотите скопировать контент из "${this.sourceFile.basename}" в выбранные заметки?` });

        const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons-container' });

        const confirmButton = new ButtonComponent(buttonContainer);
        confirmButton.setButtonText('Подтвердить').onClick(async () => {
            await this.plugin.copyAndPasteContent(this.sourceFile, this.targetFiles);
            this.close();
        });

        const cancelButton = new ButtonComponent(buttonContainer);
        cancelButton.setButtonText('Отмена').onClick(() => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Класс для модального окна с похожими заметками
class SimilarNotesModal extends Modal {
    similarNotes: TFile[];
    plugin: SimilarNotesPlugin;
    activeFile: TFile;

    constructor(app: App, similarNotes: TFile[], plugin: SimilarNotesPlugin, activeFile: TFile) {
        super(app);
        this.similarNotes = similarNotes;
        this.plugin = plugin;
        this.activeFile = activeFile;
    }

    async onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Menu' });
        contentEl.createEl('h3', { text: 'Похожие заметки' });

        if (this.similarNotes.length > 0) {
            for (const note of this.similarNotes) {
                const noteItem = contentEl.createEl('div', { cls: 'similar-note-item' });

                const noteContainer = noteItem.createEl('div', { cls: 'note-container' });

                const noteLink = noteContainer.createEl('a', { text: note.basename });
                noteLink.setAttr('href', '#');
                noteLink.addEventListener('click', () => {
                    this.app.workspace.openLinkText(note.path, note.path);
                    this.close();
                });

                const infoContainer = noteContainer.createEl('div', { cls: 'note-info' });
                const content = await this.app.vault.read(note);
                const charCount = content.length;
                const lastModified = moment(note.stat.mtimeMs).format('YYYY-MM-DD HH:mm:ss');
                
                infoContainer.createEl('span', { text: `Кол-во символов: ${charCount}` });
                infoContainer.createEl('span', { text: `Дата изменения: ${lastModified}` });
            }
        } else {
            contentEl.createEl('p', { text: 'Нет похожих заметок.' });
        }

        const buttonContainer = contentEl.createEl('div', { cls: 'modal-buttons-container' });

        const closeButton = new ButtonComponent(buttonContainer);
        closeButton.setButtonText('Закрыть').onClick(() => this.close());

        const fixImagesButton = new ButtonComponent(buttonContainer);
        fixImagesButton.setButtonText('Фикс картинок').onClick(() => {
            this.plugin.fixImageLinks();
        });

        const copyContentButton = new ButtonComponent(buttonContainer);
        copyContentButton.setButtonText('Копировать контент').onClick(() => {
            new ConfirmCopyModal(this.app, this.plugin, this.activeFile, this.similarNotes).open();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
