import {InsightDatasetKind, InsightError} from "./IInsightFacade";
import {DatasetSection} from "./Section";
import {DatasetRoom} from "./Rooms";
import InsightFacade from "./InsightFacade";
import Decimal from "decimal.js";

let validMFieldSection = ["avg", "pass", "fail", "audit", "year"];
let validSFieldSection = ["dept", "id", "instructor", "title", "uuid"];
let validMFieldRoom = ["lat", "lon", "seats"];
let validSFieldRoom = ["fullname" , "shortname" ,
	"number" , "name" , "address" , "type" , "furniture" , "href"];


export default class QueryHelper {
	public static groupResults(results: any[], groupKeys: string[]): any[] {
		const groupedResults: any[] = [];

		for (const result of results) {
			let groupExists = false;

			// If a group does exist then add it to the group
			for (const groupResult of groupedResults) {
				let match = true;
				for (let key of groupKeys) {
					key = key.substring(key.indexOf("_") + 1);
					if (groupResult[key] !== result[key]) {
						match = false;
						break;
					}
				}

				if (match) {
					groupResult.results.push(result);
					groupExists = true;
					break;
				}
			}

			/* If a group doesn't already exist for the result, create an obj with structure
			{
				results: [
					{ results here}
				],
				groupKey1: groupValue,
				groupKey2: groupValue,
				groupKeyEtc: groupValue,
				...
			}
			*/
			if (!groupExists) {
				const newGroupResult: any = {};
				newGroupResult.results = [result];
				for (let key of groupKeys) {
					key = key.substring(key.indexOf("_") + 1);
					newGroupResult[key] = result[key];
				}
				groupedResults.push(newGroupResult);
			}
		}

		return groupedResults;
	}

	public static applyTransformations(groupedResults: any[], applyRules: any, applyKeyArray: any[],
									   kind: InsightDatasetKind): any[] {
		const transformedGroups = [];
		let uniqueSet = new Set(applyKeyArray);
		if (applyKeyArray.length !== uniqueSet.size) {
			throw new InsightError("applyTransformations - duplicate applyKeys");
		}
		for (const group of groupedResults) {
			for (const applyRule of applyRules) {
				/*
				"APPLY": [
      				{
        				"overallAvg":
        				{
          					"AVG": "sections_avg"
        				}
      				}
    			]
				*/
				const aggFieldName = Object.keys(applyRule)[0]; 									// "overallAvg"
				const aggregationOp = Object.keys(applyRule[aggFieldName])[0];						// "AVG"
				const aggKeyWithDatabase = applyRule[aggFieldName][aggregationOp];					// "sections_avg"
				if (typeof aggKeyWithDatabase !== "string" || aggKeyWithDatabase.indexOf("_") === -1) {
					throw new InsightError("applyTransformations - invalid aggKey");
				}
				const aggKey = aggKeyWithDatabase.substring(aggKeyWithDatabase.indexOf("_") + 1);	// "avg"

				let values = [];
				for (const result of group.results) {
					values.push(result[aggKey]);
				}

				if (values.length === 0) {
					return [];
				}
				let aggregatedValue = this.aggregationSwitch(aggregationOp, aggKey, values, kind);
				// If a key is in COLUMNS it must show up in either GROUP or APPLY
				// Therefore it is safe to discard all other fields (AKA can drop the results property)
				// group[aggFieldName] = aggregatedValue;
				group["aggregation"] = {
					...group["aggregation"],
					[aggFieldName]: aggregatedValue
				};
			}
			const {results, ...newGroup} = group;
			transformedGroups.push(newGroup);
		}
		return transformedGroups;
	}

	private static aggregationSwitch(aggregationOp: any, aggKey: any, values: any, kind: InsightDatasetKind): any {
		let avg: any, total = new Decimal(0);
		// https://mikemcl.github.io/decimal.js/
		switch (aggregationOp) {
			case "MAX":
				if (kind === InsightDatasetKind.Sections && !validMFieldSection.includes(aggKey) ||
					kind === InsightDatasetKind.Rooms && !validMFieldRoom.includes(aggKey)) {
					throw new InsightError("applyTransformations - aggregation key is not numeric");
				}
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/max
				return values.filter((value: any) => typeof value === "number")
					.reduce((a: number, b: number) => Math.max(a, b), -Infinity);
			case "MIN":
				if (kind === InsightDatasetKind.Sections && !validMFieldSection.includes(aggKey) ||
					kind === InsightDatasetKind.Rooms && !validMFieldRoom.includes(aggKey)) {
					throw new InsightError("applyTransformations - aggregation key is not numeric");
				}
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/min
				return values.filter((value: any) => typeof value === "number")
					.reduce((a: number, b: number) => Math.min(a, b), Infinity);
			case "AVG":
				if (kind === InsightDatasetKind.Sections && !validMFieldSection.includes(aggKey) ||
					kind === InsightDatasetKind.Rooms && !validMFieldRoom.includes(aggKey)) {
					throw new InsightError("applyTransformations - aggregation key is not numeric");
				}
				for (let value of values) {
					total = Decimal.add(total, new Decimal(value));
				}
				avg = total.toNumber() / values.length;
				return Number(avg.toFixed(2));
			case "SUM":
				if (kind === InsightDatasetKind.Sections && !validMFieldSection.includes(aggKey) ||
					kind === InsightDatasetKind.Rooms && !validMFieldRoom.includes(aggKey)) {
					throw new InsightError("applyTransformations - aggregation key is not numeric");
				}
				for (let value of values) {
					total = Decimal.add(total, new Decimal(value));
				}
				return Number(total.toNumber().toFixed(2));
			case "COUNT":
				// https://dev.to/clairecodes/how-to-create-an-array-of-unique-values-in-javascript-using-sets-5dg6
				if ((kind === InsightDatasetKind.Sections && (!validSFieldSection.includes(aggKey) &&
						!validMFieldSection.includes(aggKey))) ||
					(kind === InsightDatasetKind.Rooms && (!validSFieldRoom.includes(aggKey) &&
						!validMFieldRoom.includes(aggKey)))) {
					throw new InsightError("applyTransformations - aggregation key is not numeric or alpha");
				}
				return [... new Set(values)].length;
			default:
				throw new InsightError("Invalid Aggregation Operation");
		}
	}

	private static filterOptions(datasetItem: any, COLUMNS: any): object {
		let newObj: object = {};

		for (let column of COLUMNS) {
			let value;

			if (column == null || column === "") {
				throw new InsightError("Null column");
			}

			if (column.toString().includes("_")) {
				let newField = column.substring(column.indexOf("_") + 1);
				value = datasetItem[newField];
			} else {
				value = datasetItem["aggregation"][column];
			}

			if (value == null) {
				throw new InsightError("Null field");
			}

			Object.assign(newObj, {[column]: value});
		}

		return newObj;
	}

	public static applyOptions(results: any[], options: any): any[] {
		const appliedOptions: any[] = [];
		const {COLUMNS, ORDER} = options;
		if (ORDER != null && typeof ORDER === "object") {
			if (ORDER.dir == null || ORDER.keys == null ){
				throw new InsightError("applyOptions - ORDER exists, but no dir or keys");
			}
			for (let key of ORDER.keys) {
				if (!COLUMNS.includes(key)) {
					throw new InsightError("applyOptions - order key doesn't exist");
				}
			}
		} else if (ORDER != null && typeof ORDER === "string") {
			if (!COLUMNS.includes(ORDER)) {
				throw new InsightError("applyOptions - order key doesn't exist");
			}
		}
		for (let result of results) {
			let newResult = this.filterOptions(result, COLUMNS);
			appliedOptions.push(newResult);
		}
		if (ORDER != null) {
			let orderKey = options.ORDER;
			// if (!COLUMNS.includes(orderKey)) {
			// 	throw new InsightError("applyOptions - order key doesn't exist in columns");
			// }
			// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
			// the compare func returning greater than 0 means a will come after b
			let direction = orderKey.dir;
			if (direction == null && orderKey.keys == null) {
				return appliedOptions.sort((a, b) => (a[orderKey] > b[orderKey] ? 1 : -1));
			}
			if (direction && direction !== "UP" && direction !== "DOWN") {
				throw new InsightError("applyOptions - direction is not up or down");
			}
			appliedOptions.sort((a, b) => {
				for (let key of orderKey.keys) {
					if (!COLUMNS.includes(key)) {
						throw new InsightError("applyOptions - key isn't in COLUMNS");
					}
					if (a[key] > b[key]) {
						// if a > b (1 > 2)
						// for UP - sort A after B (max at bottom) [1,2]; sort 1
						// for DOWN - sort A before B (max at top) [2,1]; sort -1
						return direction === "UP" ? 1 : -1;
					} else if (a[key] < b[key]) {
						// if a < b (1 < 2)
						// for UP - sort A before B (max at bottom) [1,2]; sort -1
						// for DOWN - sort A after B (max at top) [2,1]; sort 1
						return direction === "UP" ? -1 : 1;
					}
				}
				return 0;
			});
		}
		return appliedOptions;
	}
}
