import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
	ResultTooLargeError,
} from "./IInsightFacade";
import JSZip, {JSZipObject} from "jszip";
import {FileSection, DatasetSection} from "./Section";
import InsightFacadeHelper from "./InsightFacadeHelper";
import fs from "fs-extra";
import {DatasetRoom} from "./Rooms";
import RoomHelper from "./RoomHelper";
import QueryHelper from "./QueryHelper";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	public datasets: {
		[id: string]: {
			kind: InsightDatasetKind;
			data: DatasetSection[] | DatasetRoom[];
			numRows: number;
		};
	};

	constructor() {
		// On init should check if a data folder exists and restore data from that directory
		// if datasets are null for crash recovery
		console.log("InsightFacadeImpl::init()");
		this.datasets = {};
		this.readDatasetsFromFile();
	}

	private insertDataset(id: string, kind: InsightDatasetKind, dataset: DatasetSection[] | DatasetRoom[]): void {
		this.datasets[id] = {
			kind: kind === InsightDatasetKind.Sections ? InsightDatasetKind.Sections : InsightDatasetKind.Rooms,
			data: dataset,
			numRows: dataset.length,
		};
		this.writeDatasetToFile(id);
	}

	// https://www.geeksforgeeks.org/node-js-fs-extra-ensuredirsync-function/
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
	// https://github.com/jprichardson/node-fs-extra#sync-vs-async-vs-asyncawait
	private writeDatasetToFile(id: string) {
		const DATA_DIR = "./data";
		const FILE_PATH = `${DATA_DIR}/${id}.json`;
		try {
			fs.ensureDirSync(DATA_DIR);
			const writeData = JSON.stringify(this.datasets[id]);
			fs.writeFileSync(FILE_PATH, writeData);
		} catch (err) {
			console.error(err);
		}
	}

	// https://www.geeksforgeeks.org/node-js-fs-existssync-method/
	// https://www.geeksforgeeks.org/node-js-fs-readdirsync-method/
	// https://www.geeksforgeeks.org/node-js-fs-readfilesync-method/
	private readDatasetsFromFile() {
		const DATA_DIR = "./data";
		try {
			// Return if data folder doesn't exist
			if (!fs.existsSync(DATA_DIR)) {
				return;
			}

			const filenames = fs.readdirSync(DATA_DIR);
			for (const filename of filenames) {
				const FILE_PATH = `${DATA_DIR}/${filename}`;
				const readData = fs.readFileSync(FILE_PATH, "utf-8");
				const {kind, data, numRows} = JSON.parse(readData);
				const id = filename.replace(".json", "");
				this.datasets[id] = {kind, data, numRows};
			}
			// console.log(this.datasets);
		} catch (err) {
			console.error(err);
		}
	}

	// https://github.com/jprichardson/node-fs-extra/blob/master/docs/remove-sync.md
	private deleteDatasetFile(id: string) {
		const DATA_DIR = "./data";
		const FILE_PATH = `${DATA_DIR}/${id}.json`;
		try {
			fs.removeSync(FILE_PATH);
		} catch (err) {
			console.error(err);
		}
	}

	private addBasicValidation(id: string, kind: InsightDatasetKind): Promise<string[]> {
		if (!id || id.includes(" ") || id.includes("_") || id in this.datasets) {
			return Promise.reject(new InsightError("addDataset - id provided is invalid"));
		} else {
			return Promise.resolve([]);
		}
	}

	/*
	Extracting Zip files:
	https://stackoverflow.com/questions/39322964/extracting-zipped-files-using-jszip-in-javascript
	https://stuk.github.io/jszip/documentation/api_jszip/for_each.html
	https://stuk.github.io/jszip/documentation/api_zipobject.html
	https://stuk.github.io/jszip/documentation/api_zipobject/async.html
	*/
	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		let checkPromises: Array<Promise<any>> = [], coursesExistFlag: boolean = false;
		const jsZip = new JSZip();
		checkPromises.push(this.addBasicValidation(id, kind));
		let sectionDataset: DatasetSection[] = [], roomDataset: DatasetRoom[] = [];
		const zip = await jsZip.loadAsync(content, {base64: true});
		if (kind === InsightDatasetKind.Sections) {
			zip.forEach((relativePath, file) => {
				checkPromises.push(InsightFacadeHelper.zipCourseValidation(file));
				if (file.dir) {
					return;
				}
				coursesExistFlag = true;
				checkPromises.push(this.asyncFileRead(file, sectionDataset));
			});
			await Promise.all(checkPromises);
			if (coursesExistFlag) {
				if (sectionDataset.length <= 0) {
					throw new InsightError("addDataset - contains no valid sections");
				}
				this.insertDataset(id, kind, sectionDataset);
				return Object.keys(this.datasets);
			} else {
				throw new InsightError("addDataset - section invalid and/or not a valid course");
			}
		} else if (kind === InsightDatasetKind.Rooms) {
			if (zip.file("index.htm") === null) {
				throw new InsightError("addDataset - Rooms dataset missing index.htm file");
			}
			zip.forEach((relativePath, file) => {
				if (file.dir) {
					return;
				}
				if (file.name === "index.htm") {
					const readRoomPromise = RoomHelper.handleRoomsRead(zip, file, roomDataset);
					checkPromises.push(readRoomPromise);
				}
			});
			await Promise.all(checkPromises);
			if (roomDataset.length > 0) {
				this.insertDataset(id, kind, roomDataset);
				return Object.keys(this.datasets);
			}
		}
		throw new InsightError("addDataset - not room or section");
	}

	private async asyncFileRead(file: JSZipObject, dataset: DatasetSection[]):  Promise<any> {
		let allFilePromises = [];
		const fileReadPromise = await file.async("string");
		allFilePromises.push(fileReadPromise);
		const courseData = await JSON.parse(fileReadPromise);
		courseData["result"].forEach((fileSection: FileSection) => {
			let validSectionsFlag = InsightFacadeHelper.checkUndefinedValues(fileSection);
			if (validSectionsFlag) {
				// allFilePromises.push(Promise.reject(new InsightError("asyncFileRead - section has undefined data")));
				return;
			}
			dataset.push(InsightFacadeHelper.createDatasetSection(fileSection));
		});
		return Promise.all(allFilePromises);
	};


	public removeDataset(id: string): Promise<string> {
		if (!id || id.includes(" ") || id.includes("_")) {
			return Promise.reject(new InsightError("removeDataset - id provided is invalid"));
		}
		if (id in this.datasets) {
			delete this.datasets[id];
			this.deleteDatasetFile(id);
			return Promise.resolve(id);
		} else {
			return Promise.reject(new NotFoundError("removeDataset - datasetId not found"));
		}
	}

	public performQuery(query: unknown): Promise<InsightResult[]> {
		// Do validation on the query and pluck out the intended database id
		const queryObj = query as {[key: string]: any};
		let where = queryObj.WHERE, options = queryObj.OPTIONS, results: any[] = [], myDatasetId;
		try {
			myDatasetId = this.queryValidation(where, options, queryObj, query);
		} catch (e) {
			if (e instanceof InsightError) {
				return Promise.reject(e);
			}
		}
		if (typeof query !== "object" || this.datasets[myDatasetId] == null ||
			this.datasets[myDatasetId].kind == null) {
			return Promise.reject(new InsightError("performQuery - query provided is not an object or has null data"));
		}
		/* iterate over each DatasetSection in the dataset
		 * 		call a checkCond func to see if record matches conditions
		 * 		if it  does then push the record to the results list
		 */
		let kind = this.datasets[myDatasetId].kind;
		for (let section of this.datasets[myDatasetId].data) {
			try {
				if (InsightFacadeHelper.checkCond(section, where, kind)) {
					results.push(section);
				}
			} catch (e) {
				if (e instanceof InsightError) {
					return Promise.reject(e);
				}
			}
		}
		try {
			if (queryObj.TRANSFORMATIONS) {
				const {GROUP, APPLY} = queryObj.TRANSFORMATIONS;
				const applyKeyArray = InsightFacadeHelper.transformationValidation(GROUP, APPLY, queryObj);
				results = QueryHelper.groupResults(results, GROUP);
				results = QueryHelper.applyTransformations(results, APPLY, applyKeyArray, kind);
			}
		} catch (e) {
			if (e instanceof InsightError) {
				return Promise.reject(e);
			}
		}
		if (results.length > 5000) {
			return Promise.reject(new ResultTooLargeError());
		}
		try {
			results = QueryHelper.applyOptions(results, options);
		} catch (e) {
			if (e instanceof InsightError) {
				return Promise.reject(e);
			}
		}
		return Promise.resolve(results);
	}

	public listDatasets(): Promise<InsightDataset[]> {
		let newDatasetArray = [];
		for (const id in this.datasets) {
			let newDatasetObj: any = {};
			newDatasetObj["id"] = id;
			newDatasetObj["kind"] = this.datasets[id].kind;
			newDatasetObj["numRows"] = this.datasets[id].numRows;
			newDatasetArray.push(newDatasetObj);
		}
		return Promise.resolve(newDatasetArray);
	}

	private queryValidation(where: any, options: any, queryObj: any, query: any) {
		if (where === undefined || options === undefined) {
			throw new InsightError("performQuery - WHERE and/or OPTIONS does not exist");
		}

		// grabbing first item in Options.Column
		let validDatasetId = queryObj.OPTIONS.COLUMNS[0];
		try {
			if (queryObj.TRANSFORMATIONS) {
				validDatasetId = InsightFacadeHelper.fieldAndDatasetIdValidation(
					queryObj.TRANSFORMATIONS.GROUP[0],
					this.datasets
				);
			} else {
				validDatasetId = InsightFacadeHelper.fieldAndDatasetIdValidation(
					queryObj.OPTIONS.COLUMNS[0],
					this.datasets
				);
			}
			InsightFacadeHelper.checkMatchingDatasetId(query);
		} catch (e) {
			if (e instanceof InsightError) {
				throw e;
			}
		}
		return validDatasetId;
	}
}
