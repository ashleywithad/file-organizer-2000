import {
	Plugin,
	Notice,
	PluginSettingTab,
	App,
	Setting,
	getLinkpath,
} from "obsidian";
import useName from "./modules/name";
import useVision from "./modules/vision";
import useAudio from "./modules/audio";
import usePostProcessing from "./modules/text";
import { getAllDailyNotes, getDailyNote } from "./lib/daily-notes";
import moment from "moment";

const isSupportedImage = ["png", "jpeg", "gif", "webp", "jpg"];
const isSupportedAudio = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"];

function formatToSafeName(format: string) {
	return format.replace(/[\\/:"]/g, "");
}

class FileOrganizerSettings {
	API_KEY = "";
	folderPath = "_FileOrganizer2000";
	useDailyNotesLog = false;
}

export default class FileOrganizer extends Plugin {
	settings: FileOrganizerSettings;

	appHasDailyNotesPluginLoaded(): boolean {
		const app = this.app;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const dailyNotesPlugin = (<any>app).internalPlugins.plugins[
			"daily-notes"
		];
		if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
			return true;
		}
		return false;
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FileOrganizerSettingTab(this.app, this));
		// console.log(getDailyNote());
		console.log(
			"appHasDailyNotesPluginLoaded",
			this.appHasDailyNotesPluginLoaded()
		);

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on("create", async (file) => {
					console.log("File created:", file);
					// @ts-ignore
					console.log(file.extension);
					// @ts-ignore
					if (isSupportedImage.includes(file.extension)) {
						console.log("is supported image");
						await this.processImage(file);
						return;
					}
					// do the same for audio files
					//@ts-ignore
					if (isSupportedAudio.includes(file.extension)) {
						console.log("is supported audio");
						await this.processAudio(file);
					}
				})
			);
		});
	}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			new FileOrganizerSettings(),
			await this.loadData()
		);
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}

	async processAudio(file) {
		this.checkHasAPIKey();
		try {
			new Notice("Processing file...");
			const fileName = await this.createMardownFromAudio(file);
			new Notice(`File processed and saved as ${fileName}`, 5000);
			if (this.settings.useDailyNotesLog) {
				await this.appendToDailyNotes(
					`${this.settings.folderPath}/${fileName}`
				);
			}
		} catch (error) {
			console.error("Error processing file:", error);
			new Notice(`Failed to process file`, 5000);
			new Notice(`${error.message}`, 5000);
		}
	}
	async appendToDailyNotes(fileName: string) {
		const dailyNotes = getAllDailyNotes();
		const lastDailyNote = getDailyNote(moment(), dailyNotes);
		// render hours:minutes
		const now = new Date();
		const formattedNow =
			now.getHours().toString().padStart(2, "0") +
			":" +
			now.getMinutes().toString().padStart(2, "0");
		// Include the link in the processed content
		const contentWithLink = `\n - ${formattedNow} [[${fileName}]]`;
		await this.app.vault.append(lastDailyNote, contentWithLink);
	}

	async processImage(file) {
		this.checkHasAPIKey();
		try {
			new Notice(`Processing Image: ${file.name}`);
			const fileName = await this.createMardownFromImage(file);
			console.log("Daily Notes Plugin is loaded");
			new Notice(`File processed and saved as ${fileName}`, 5000);
			if (this.settings.useDailyNotesLog) {
				await this.appendToDailyNotes(
					`${this.settings.folderPath}/${fileName}`
				);
			}
		} catch (error) {
			console.error("Error processing file:", error);
			new Notice(`Failed to process file`, 5000);
			new Notice(`${error.message}`, 5000);
		}
	}
	async createMardownFromAudio(file) {
		this.checkHasAPIKey();
		try {
			new Notice(`Processing Audio: ${file.name}`);
			const filePath = file.vault.adapter.basePath + "/" + file.path;
			console.log(filePath);
			const transcribedText = await useAudio(
				filePath,
				this.settings.API_KEY
			);
			const postProcessedText = await usePostProcessing(
				transcribedText,
				this.settings.API_KEY
			);

			const now = new Date();
			const formattedNow = now.toISOString().replace(/[-:.TZ]/g, "");
			let name = formattedNow;
			try {
				name = await useName(postProcessedText, this.settings.API_KEY);
			} catch (error) {
				console.error("Error processing file:", error.status);
				new Notice("Could not set a human readable name.");
			}
			const safeName = formatToSafeName(name);

			const folderPath = this.settings.folderPath;
			const outputFilePath = `/${folderPath}/${safeName}.md`;

			// Check if the folder exists
			if (!this.app.vault.adapter.exists(this.settings.folderPath)) {
				// If the folder doesn't exist, create it
				await this.app.vault.createFolder(folderPath);
			}

			// Get the path of the original audio

			const originalAudioPath = this.app.vault.getResourcePath(file);
			console.log(getLinkpath(originalAudioPath));

			// Create a link to the original audio
			const audioLink = `![[${file.name}]]`;

			// Include the link in the processed content
			const contentWithLink = `${postProcessedText}\n\n${audioLink}`;

			await this.app.vault.create(outputFilePath, contentWithLink);
			return safeName;
		} catch (error) {
			console.error("Error processing file:", error);
			new Notice(`Failed to process file`, 5000);
			new Notice(`${error.message}`, 5000);
		}
	}
	async createMardownFromImage(file) {
		const arrayBuffer = await this.app.vault.readBinary(file);
		const fileContent = Buffer.from(arrayBuffer);
		const encodedImage = fileContent.toString("base64");
		console.log(`Encoded: ${encodedImage.substring(0, 20)}...`);

		const processedContent = await useVision(
			encodedImage,
			this.settings.API_KEY
		);

		const now = new Date();
		const formattedNow = now.toISOString().replace(/[-:.TZ]/g, "");
		let name = formattedNow;
		try {
			name = await useName(processedContent, this.settings.API_KEY);
		} catch (error) {
			console.error("Error processing file:", error.status);
			new Notice("Could not set a human readable name.");
		}
		const safeName = formatToSafeName(name);
		const folderPath = this.settings.folderPath;
		const outputFilePath = `/${folderPath}/${safeName}.md`;

		// Check if the folder exists
		if (!this.app.vault.adapter.exists(folderPath)) {
			// If the folder doesn't exist, create it
			await this.app.vault.createFolder(folderPath);
		}

		// Create a link to the original image
		const imageLink = `![[${file.name}]]`;

		// Include the link in the processed content
		const contentWithLink = `${processedContent}\n\n${imageLink}`;

		await this.app.vault.create(outputFilePath, contentWithLink);
		return safeName;
	}

	checkHasAPIKey() {
		if (!this.settings.API_KEY) {
			new Notice(
				"Please enter your API Key in the settings of the OCR plugin."
			);
			return false;
		}
		return true;
	}
}
class FileOrganizerSettingTab extends PluginSettingTab {
	plugin: FileOrganizer;

	constructor(app: App, plugin: FileOrganizer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Enter your API Key here")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API Key")
					.setValue(this.plugin.settings.API_KEY)
					.onChange(async (value) => {
						this.plugin.settings.API_KEY = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Output Folder Path")
			.setDesc(
				"Enter the path where you want to save the processed files. e.g. Processed/myfavoritefolder"
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your path")
					.setValue(this.plugin.settings.folderPath)
					.onChange(async (value) => {
						value = value.trim();
						// cleanup path remove leading and trailing slashes
						value = value.replace(/^\/+|\/+$/g, "");
						this.plugin.settings.folderPath = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Use Daily Notes Log")
			.setDesc("Enable or disable the use of daily notes log.")
			.setDisabled(!this.plugin.appHasDailyNotesPluginLoaded())
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useDailyNotesLog)
					.onChange(async (value) => {
						this.plugin.settings.useDailyNotesLog = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
