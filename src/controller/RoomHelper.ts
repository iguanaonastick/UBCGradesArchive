import JSZip, {JSZipObject} from "jszip";
import {DatasetRoom, GeoResponse} from "./Rooms";
import * as parse5 from "parse5";
import {ChildNode, Document, Element, TextNode} from "parse5/dist/tree-adapters/default";
import {InsightError} from "./IInsightFacade";
import http from "http";

export default class RoomHelper {
	public static async handleRoomsRead(zip: JSZip, file: JSZipObject, dataset: DatasetRoom[]):  Promise<any> {
		const htmlText: string = await file.async("text");
		const document = parse5.parse(htmlText);
		const tdElements: Element[] = this.getAllTDElements(document);
		const validTableCell = tdElements.find((tdElement) => this.isValidTableCell(tdElement));
		if (!validTableCell) {
			return Promise.reject(new InsightError("handleRoomsRead - no valid table cell found"));
		}
		const validTable = (validTableCell.parentNode as Element).parentNode as Element;
		const validRows = validTable.childNodes.filter((childNode) => childNode.nodeName === "tr");
		const roomPromises = (validRows as Element[]).map(async (row) => {
			const deref = await this.getRoomDataFromTableRow(row);
			if (deref === null) {
				return;
			}
			const {shortName, fullName, address, href} = deref;
			if (href != null) {
				const buildingFile = await zip.file(href)?.async("text");
				if (buildingFile) {
					const buildingRoomsArray = this.retrieveRoomData(buildingFile);
					if (buildingRoomsArray.length !== 0) {
						const geoResponse = await this.getGeoData(address);
						if (geoResponse.error) {
							console.error(geoResponse.error); // We should be getting coords for every valid room
							return;
						}
						if (geoResponse.lat == null || geoResponse.lon == null ) {
							return;
						}
						for (let room of buildingRoomsArray) {
							dataset.push(new DatasetRoom(fullName, shortName, room.roomNum,
								shortName + "_" + room.roomNum, address, geoResponse.lat,
								geoResponse.lon, room.roomCap, room.roomType, room.roomFurn, room.href
							));
						}
					}
				} else {
					return Promise.reject(new InsightError("handleRoomsRead - no rooms to add"));
				}
			} else {
				return; // Building has no rooms to add
			}
		});
		await Promise.all(roomPromises);
		return Promise.resolve(dataset);
	};

	private static retrieveRoomData(html: string) {
		const rooms: Array<{
			roomNum: string; roomCap: number; roomFurn: string; roomType: string; href: string;
		}> = [];
		if (html) {
			const buildingDocument = parse5.parse(html);
			const buildingTDElements: Element[] = this.getAllTDElements(buildingDocument);
			const validBuildingTableCell = buildingTDElements.find((tdElement) =>
				this.isValidTableCell(tdElement)
			);
			if (!validBuildingTableCell) {
				return rooms; // Return here? Building has no rooms to add
			}
			const validBuildingTable = (validBuildingTableCell.parentNode as Element).parentNode as Element;
			const validBuildingRows = validBuildingTable.childNodes.filter((childNode) => childNode.nodeName === "tr");
			(validBuildingRows as Element[]).map((bRow) => {
				const bColumns = bRow.childNodes.filter((childNode) => childNode.nodeName === "td");
				const roomNumColumn = this.findClassAttr(bColumns, "views-field-field-room-number");
				const roomCapColumn = this.findClassAttr(bColumns, "views-field-field-room-capacity");
				const roomFurnColumn = this.findClassAttr(bColumns, "views-field-field-room-furniture");
				const roomTypeColumn = this.findClassAttr(bColumns, "views-field-field-room-type");
				const roomHrefColumn = this.findClassAttr(bColumns, "views-field-nothing");
				if (!roomNumColumn || !roomCapColumn || !roomFurnColumn || !roomTypeColumn || !roomHrefColumn) {
					return rooms;
				}
				const roomNumATag = roomNumColumn.childNodes.find(
					(childNode) => childNode.nodeName === "a");
				const roomNum = ((roomNumATag as Element).childNodes.find(
					(childNode) => childNode.nodeName === "#text") as TextNode
				).value.trim();
				const roomCap = Number((roomCapColumn.childNodes.find(
					(childNode) => childNode.nodeName === "#text") as TextNode
				).value.trim());
				const roomFurn = (roomFurnColumn.childNodes.find(
					(childNode) => childNode.nodeName === "#text") as TextNode
				).value.trim();
				const roomType = (roomTypeColumn.childNodes.find(
					(childNode) => childNode.nodeName === "#text") as TextNode
				).value.trim();
				const hrefTag = roomHrefColumn.childNodes.find(
					(childNode) => childNode.nodeName === "a");
				const href = (hrefTag as Element).attrs.find((attr) => attr.name === "href")?.value.trim();
				if (href == null) {
					return rooms;
				}
				rooms.push({roomNum, roomCap, roomFurn, roomType, href});
			});
		}
		return rooms;
	}

	// https://www.golinuxcloud.com/http-get-request-in-node-js/
	private static getGeoData(address: string): Promise<GeoResponse> {
		const encodedAddress = encodeURIComponent(address);
		const url = `http://cs310.students.cs.ubc.ca:11316/api/v1/project_team<048>/${encodedAddress}`;
		return new Promise<GeoResponse>((resolve, reject) => {
			http.get(url,(res) => {
				let data = "";

				res.on("data", (chunk: string) => {
					data += chunk;
				});

				res.on("end", () => {
					const geoResponse: GeoResponse = JSON.parse(data);
					resolve(geoResponse);
				});
			}).on("error", (error) => {
				reject(new Error(`Failed to retrieve geolocation data for ${address}: ${error.message}`));
			});
		});
	}

	private static async getRoomDataFromTableRow(row: Element): Promise<{
		shortName: string,
		fullName: string,
		address: string,
		href: string | undefined
	} | null> {
		let shortName, fullNameATag, fullName, address, href, hrefTag;
		const columns = row.childNodes.filter((childNode) => childNode.nodeName === "td");
		const shortNameColumn = this.findClassAttr(columns, "views-field-field-building-code");
		const fullNameColumn = this.findClassAttr(columns, "views-field-title");
		const addressColumn = this.findClassAttr(columns, "views-field-field-building-address");
		const hrefColumn = this.findClassAttr(columns, "views-field-nothing");
		if (shortNameColumn && fullNameColumn && addressColumn && hrefColumn) {
			shortName = (shortNameColumn.childNodes.find(
				(childNode) => childNode.nodeName === "#text") as TextNode
			).value.trim();
			fullNameATag = fullNameColumn.childNodes.find(
				(childNode) => childNode.nodeName === "a");
			fullName = ((fullNameATag as Element).childNodes.find(
				(childNode) => childNode.nodeName === "#text") as TextNode
			).value.trim();
			address = (addressColumn.childNodes.find(
				(childNode) => childNode.nodeName === "#text") as TextNode
			).value.trim();
			hrefTag = hrefColumn.childNodes.find(
				(childNode) => childNode.nodeName === "a");
			href = (hrefTag as Element).attrs.find((attr) => attr.name === "href")?.value.trim().substring(2);
			return {
				shortName,
				fullName,
				address,
				href
			};
		}
		throw new InsightError("getRoomDataFromTableRow - invalid or nonexistent rows/columns");
	}


	private static findClassAttr(columns: ChildNode[], attrValue: string): Element | undefined {
		const concatAttrValue = "views-field " + attrValue;
		return (columns as Element[]).find((column) => {
			const classAttr = column.attrs.find((attr) => attr.name === "class");
			return classAttr && classAttr.value === concatAttrValue;
		});
	}


	private static isValidTableCell(node: Element): boolean {
		const validClasses: string[] = [
			"views-field", "views-field-field-room-number", "views-field-field-room-capacity",
			"views-field-field-room-furniture", "views-field-field-room-type", "views-field-title",
			"views-field-field-building-address", "views-field-field-building-image", "views-field-field-building-code",
			"views-field-nothing",
		];

		const classAttr = node.attrs.find((attr) => attr.name === "class");
		if (!classAttr) {
			return false;
		}
		const classes = classAttr.value.split(" ");
		return classes.some((className) =>
			validClasses.some((validClass) => className.includes(validClass))
		);
	}

	private static getAllTDElements(document: Document): Element[] {
		const tdElements: Element[] = [];

		function traverse(node: ChildNode | Document): void {
			if (node.nodeName === "td") {
				tdElements.push(node as Element);
			}

			if ("childNodes" in node) {
				for (const childNode of node.childNodes) {
					traverse(childNode);
				}
			}
		}

		traverse(document);
		return tdElements;
	}

}
