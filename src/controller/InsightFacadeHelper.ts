import {DatasetSection, FileSection} from "./Section";
import {InsightDatasetKind, InsightError} from "./IInsightFacade";
import {JSZipObject} from "jszip";
import {DatasetRoom} from "./Rooms";

let validMFieldSection = ["avg", "pass", "fail", "audit", "year"];
let validSFieldSection = ["dept", "id", "instructor", "title", "uuid"];
let validMFieldRoom = ["lat", "lon", "seats"];
let validSFieldRoom = ["fullname" , "shortname" ,
	"number" , "name" , "address" , "type" , "furniture" , "href"];


export default class InsightFacadeHelper {
	public static mComparatorSwitch(
		operator: string, datasetItem: DatasetSection | DatasetRoom, field: string, value: any, kind: InsightDatasetKind
	) {
		const isSection = ("dept" in datasetItem);
		if (kind === InsightDatasetKind.Sections && !validMFieldSection.includes(field) ||
			kind === InsightDatasetKind.Rooms && !validMFieldRoom.includes(field)) {
			throw new InsightError("mComparatorSwitch - invalid mField");
		}
		if (typeof value !== "number") {
			throw new InsightError("mComparatorSwitch - value provided is not a number");
		}

		switch (operator) {
			case "GT":
				return isSection ?
					datasetItem[field as keyof DatasetSection] > value :
					datasetItem[field as keyof DatasetRoom] > value;
			case "LT":
				return isSection ?
					datasetItem[field as keyof DatasetSection] < value :
					datasetItem[field as keyof DatasetRoom] < value ;
			case "EQ":
				return isSection ?
					datasetItem[field as keyof DatasetSection] === value :
					datasetItem[field as keyof DatasetRoom] === value;
			default:
				throw new InsightError("mComparatorSwitch - operator is not GT, LT, or EQ");
		}
	}

	public static checkUndefinedValues(fileSection: FileSection): boolean {
		return (
			fileSection.id === undefined ||
			fileSection.Course === undefined ||
			fileSection.Title === undefined ||
			fileSection.Professor === undefined ||
			fileSection.Subject === undefined ||
			fileSection.Year === undefined ||
			fileSection.Avg === undefined ||
			fileSection.Pass === undefined ||
			fileSection.Fail === undefined ||
			fileSection.Audit === undefined
		);
	}

	public static createDatasetSection(fileSection: FileSection): DatasetSection {
		const year = fileSection.Section === "overall" ? 1900 : Number(fileSection.Year);
		return new DatasetSection(
			fileSection.id.toString(),
			fileSection.Course,
			fileSection.Title,
			fileSection.Professor,
			fileSection.Subject,
			year,
			fileSection.Avg,
			fileSection.Pass,
			fileSection.Fail,
			fileSection.Audit
		);
	}

	public static zipCourseValidation(file: JSZipObject): Promise<string[]> {
		if (!file.name.includes("courses/")) {
			return Promise.reject(new InsightError("zipCourseValidation - course isn't located within courses/ dir"));
		} else {
			return Promise.resolve([]);
		}
	}

	public static wildcardMatch(searchTerm: string, datasetValue: string): boolean {
		const startsWith = searchTerm.startsWith("*");
		const startIndex = startsWith ? 1 : 0;
		const endsWith = searchTerm.endsWith("*");
		const endIndex = endsWith ? searchTerm.length - 1 : searchTerm.length;
		const term = searchTerm.slice(startIndex, endIndex);
		if (term.includes("*")) {
			throw new InsightError("wildcardMatch - a wildcard character cannot be in the middle of a search term.");
		}
		if (startsWith && endsWith) {
			return datasetValue.includes(term);
		} else if (startsWith) {
			// Starting with *term means search term should end with the term
			return datasetValue.endsWith(term);
		} else if (endsWith) {
			return datasetValue.startsWith(term);
		} else {
			return false;
		}
	}

	public static fieldAndDatasetIdValidation(
		validDatasetId: string,
		datasets: {[p: string]: {kind: InsightDatasetKind; data: DatasetSection[] | DatasetRoom[]; numRows: number}}
	): string {
		if (validDatasetId === undefined) {
			throw new InsightError("fieldAndDatasetIdValidation - validDatasetId is undefined");
		}

		if (validDatasetId.indexOf("_") !== -1) {
			// key = value after _
			// let kind = datasets[validDatasetId].kind;
			let comparatorField = validDatasetId.substring(validDatasetId.indexOf("_") + 1);
			// datasetid = value before _
			validDatasetId = validDatasetId.substring(0, validDatasetId.indexOf("_"));
			if (datasets[validDatasetId] === undefined) {
				throw new InsightError("fieldAndDatasetIdValidation - datasetId doesn't exist");
			}
			let kind = datasets[validDatasetId].kind;
			if ((kind === InsightDatasetKind.Sections && (!validSFieldSection.includes(comparatorField) &&
					!validMFieldSection.includes(comparatorField))) ||
				(kind === InsightDatasetKind.Rooms && (!validSFieldRoom.includes(comparatorField) &&
					!validMFieldRoom.includes(comparatorField)))) {
				throw new InsightError("fieldAndDatasetIdValidation - mField and/or sField is invalid");
			}
		} else {
			throw new InsightError("fieldAndDatasetIdValidation - validDatasetId is in the incorrect format");
		}
		return validDatasetId;
	}

	public static checkMatchingDatasetId(query: any) {
		let stringifiedQuery = JSON.stringify(query);
		// https://regex101.com/
		// https://stackoverflow.com/questions/71270799/regex-all-before-an-underscore-and-all-between-second-underscore-and-the-last
		// remove all {, }, :, " from query, and it will start to identify matches
		let regexForId = /[^{}:"]*_/g;
		let arrayOfIds = stringifiedQuery.match(regexForId);
		let firstMatch = null;
		if (arrayOfIds != null) {
			for (let id of arrayOfIds) {
				if (firstMatch === null) {
					firstMatch = id;
				} else {
					if (id !== firstMatch) {
						throw new InsightError("checkMatchingDatasetId - ids are not matching");
					}
				}
			}
		}
	}

	public static recursionLogic(conditions: any, datasetItem: DatasetSection | DatasetRoom, field: string,
								 operator: string, value: any, kind: InsightDatasetKind): boolean {
		const isSection = ("dept" in datasetItem);
		if (Array.isArray(conditions.OR)) {
			for (let subConds of conditions.OR) {
				if (this.checkCond(datasetItem, subConds, kind)) {
					// if any of the subconditions are true, the OR is true.
					return true;
				}
			}
			return false;
		} else if (Array.isArray(conditions.AND)) {
			for (let subConds of conditions.AND) {
				if (!this.checkCond(datasetItem, subConds, kind)) {
					// if any of the subconditions are false, the AND is false.
					return false;
				}
			}
			return true;
		} else if ("NOT" in conditions) {
			return !this.checkCond(datasetItem, conditions.NOT, kind);
		} else if ("IS" in conditions) {
			if (kind === InsightDatasetKind.Sections && !validSFieldSection.includes(field) ||
				kind === InsightDatasetKind.Rooms && !validSFieldRoom.includes(field) || typeof value !== "string") {
				throw new InsightError("checkCond - sField invalid, or value provided isn't a string");
			}
			if (value.includes("*")) {
				return isSection ?
					InsightFacadeHelper.wildcardMatch(value, datasetItem[field as keyof DatasetSection] as string) :
					InsightFacadeHelper.wildcardMatch(value, datasetItem[field as keyof DatasetRoom] as string);
			} else {
				return isSection ?
					datasetItem[field as keyof DatasetSection] === value :
					datasetItem[field as keyof DatasetRoom] === value;
			}
		} else {
			return InsightFacadeHelper.mComparatorSwitch(operator, datasetItem, field, value, kind);
		}
	}


	/* checkCond func
	 *  takes in a single DatasetSection and the list of conditions
	 *  Idea is that this will be a recursive function that can call itself to handle the AND/OR potential infinite nesting
	 *  Does this by checking at the beginning of the function for the presence of a conditions.OR or .AND property
	 *  If that exists then pass the sub conditions associated with it to checkConditions(section, subConditons)
	 * Otherwise identify the operator at the bottom such as "GT" and have a switch statement take care of determining whether the record should be returned
	 *
	 */
	public static checkCond(section: DatasetSection | DatasetRoom, conditions: any, kind: InsightDatasetKind): boolean {
		let operator = Object.keys(conditions)[0];
		let key, field, value;
		if (operator) {
			let operand = conditions[operator]; // the dictionary held by a filter such as { sections_avg: 97 }
			if (Object.keys(operand).length === 0) {
				throw new InsightError("checkCond - there are no conditions provided");
			}
			key = Object.keys(operand)[0];
			field = key.substring(key.indexOf("_") + 1);
			value = operand[key];
		} else {
			return true;
		}
		return InsightFacadeHelper.recursionLogic(conditions, section, field, operator, value, kind);
	}


	public static transformationValidation(GROUP: any, APPLY: any, queryObj: {[p: string]: any}): string[] {
		if (GROUP == null || APPLY == null) {
			throw new InsightError("transformationValidation - GROUP and/or APPLY is missing");
		}
		const applyKeyArray = APPLY.map((obj: any) => Object.keys(obj)[0]);
		let groupAndApply = applyKeyArray.concat(GROUP);
		for (let key of queryObj.OPTIONS.COLUMNS) {
			if (!groupAndApply.includes(key)) {
				throw new InsightError("transformationValidation - apply keys do not match columns");
			}
		}

		let uniqueSet = new Set(applyKeyArray);
		if (uniqueSet.size !== applyKeyArray.length) {
			throw new InsightError("transformationValidation - duplicate applyKeys exist");
		}

		return applyKeyArray;
	}
}
