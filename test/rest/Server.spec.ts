import Server from "../../src/rest/Server";
import InsightFacade from "../../src/controller/InsightFacade";
import {expect} from "chai";
import request, {Response} from "supertest";
import {getContentFromArchives} from "../TestUtil";

describe("Server", () => {

	let facade: InsightFacade;
	let server: Server;
	let oneCourse: string;
	let ENDPOINT_URL: string;
	let SERVER_URL: string = "http://localhost:4321";

	before(async () => {
		facade = new InsightFacade();
		server = new Server(4321);
		oneCourse = getContentFromArchives("onecourse.zip");
		ENDPOINT_URL = "/dataset/mysections/sections";
		// TODO: start server here once and handle errors properly
	});

	after(async () => {
		// TODO: stop server here once!
	});

	beforeEach(() => {
		// might want to add some process logging here to keep track of what's going on
	});

	afterEach(() => {
		// might want to add some process logging here to keep track of what's going on
	});

	describe("GET tests", function () {
		it("GET test for only homepage", async () => {
			try {
				return request(SERVER_URL)
					.get("/")
					.then((res: Response) => {
						expect(res.text).to.be.equal("Hello World!");
						expect(res.status).to.be.equal(200);
					})
					.catch((err) => {
						console.log(err);
						expect.fail();
					});
			} catch (err) {
				console.log(err);
			}
		});
	});

	describe("PUT tests", function () {
		it("PUT test for courses dataset", async () => {
			try {
				return request(SERVER_URL)
					.put(ENDPOINT_URL)
					.send(oneCourse)
					.set("Content-Type", "application/x-zip-compressed")
					.then((res: Response) => {
						expect(res.status).to.be.equal(200);
						expect(res.text).to.be.equal("PUT!");
						// console.log(res);
						// more assertions here
					})
					.catch((err) => {
						console.log(err);
						// some logging here please!
						expect.fail();
					});
			} catch (err) {
				// and some more logging here!
			}
		});
	});

	// Sample on how to format PUT requests
	/*
	it("PUT test for courses dataset", async () => {
		try {
			return request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(ZIP_FILE_DATA)
				.set("Content-Type", "application/x-zip-compressed")
				.then((res: Response) => {
					expect(res.status).to.be.equal(200);
					// more assertions here
				})
				.catch((err) => {
					// some logging here please!
					expect.fail();
				});
		} catch (err) {
			// and some more logging here!
		}
	});
	 */

	// The other endpoints work similarly. You should be able to find all instructions at the chai-http documentation
});
