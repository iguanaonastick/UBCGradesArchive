<!-- general structure / svelte-navigator : https://svelte.dev/repl/451fd183e0d3403cb7800101f7d799fb?version=3.57.0-->

<script>
	import {Router, Route, Link} from "svelte-navigator";
	let query = "";
	let resultQuery = "";
	let resultAdd = "";
	let resultList = "";
	let resultDelete = "";
	let newDatasetId = "";
	let kind = "sections";
	let deleteDatasetId = "";
	let queryResultsSeparated = "";
	let errorQuery = "";
	let errorAdd = "";
	let errorDelete = "";


	// https://stackoverflow.com/questions/65050679/javascript-a-simple-way-to-save-a-text-file
	// https://stackoverflow.com/questions/26158468/create-json-file-using-blob
	function download() {
		const file = new Blob([resultQuery], { type: "application/json" });
		const element = document.createElement("a");
		element.href = URL.createObjectURL(file);
		element.download = "results.json";
		document.body.appendChild(element);
		element.click();
		document.body.removeChild(element);
	}

	// https://svelte.dev/repl/c62df203051345bfab6aaa4350faf8f4?version=3.20.1
	async function queryPostRequest () {
		const res = await fetch("http://localhost:4321/query", {
			method: 'POST',
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(JSON.parse(query))
		})

		const json = await res.json()
		queryResultsSeparated = json.result;
		resultQuery = JSON.stringify(json.result)
		errorQuery = JSON.stringify(json.error)
	}

	// https://www.digitalocean.com/community/tutorials/js-file-reader
	// https://stackoverflow.com/questions/17274655/how-to-download-zip-and-save-multiple-files-with-javascript-and-get-progress
	// https://stackoverflow.com/questions/67484579/problem-with-async-await-with-filereader-in-javascript
	async function addPutRequest() {
		const reader = new FileReader();
		const file = document.getElementById('myFile').files[0];

		reader.onload = async () => {
			const res = await fetch("http://localhost:4321/dataset/" + newDatasetId + "/" + kind, {
				method: 'PUT',
				headers: { "Content-Type": "application/zip" },
				body: reader.result
			});
			const json = await res.json();
			resultAdd = JSON.stringify(json.result);
			errorAdd = JSON.stringify(json.error);
		};
		reader.readAsArrayBuffer(file);
	}

	async function deleteDeleteRequest () {
		const res = await fetch("http://localhost:4321/dataset/" + deleteDatasetId, {
			method: 'DELETE',
			body: JSON.stringify(deleteDatasetId)
		})

		const json = await res.json()
		resultDelete = JSON.stringify(json.result)
		errorDelete = JSON.stringify(json.error);
	}

	async function listGetDatasets() {
		const res = await fetch("http://localhost:4321/datasets", {
			method: 'GET'
		})
		const json = await res.json()
		resultList = JSON.stringify(json.result)
	}
</script>

<style>
	.success {
		color: green;
	}
	.fail {
		color: red;
	}

	.resultListWidth {
		width: 600px;
	}
	table {
		margin: 15px;
	}

	#table-wrapper {
		position:relative;
	}
	#table-scroll {
		height:375px;
		overflow:auto;
		margin-top:20px;
	}
	#table-wrapper table {
		width:95%;

	}
	#table-wrapper table * {
		background:white;
		color:black;
	}

	.downloadButton {
		margin-top: 15px;
	}
</style>

<Router>
	<h1>Welcome to InsightUBC!</h1>
	<h2>Team 048</h2>
	<hr/>
	<Link to="/">Query</Link>
	<Link to="add">Add</Link>
	<Link to="list">List</Link>
	<Link to="delete">Delete</Link>
	<hr/>

	<Route path="add">
		<h3><u>Add a New Dataset</u></h3>
		<p>Dataset Name: <input type="text" bind:value={newDatasetId}/></p>
		<p>Select dataset type:
			<select name="datasetKind" bind:value={kind}>
				<option value="sections">Sections</option>
				<option value="rooms">Rooms</option>
			</select>
		</p>
		<p>
			Upload a zip file:
			<input type="file" id="myFile" name="filename"/>
		</p>
		<p>
			<input type="submit" name="uploadZip" value="Add Dataset" on:click={addPutRequest}/>
		</p>
		<!-- https://svelte.dev/tutorial/if-blocks-->
		{#if errorAdd == null}
			<p class="success"> Add Success! </p>
			<h3>Result: </h3>
			<p>All current datasets: {resultAdd}</p>
		{/if}
		{#if resultAdd == null}
			<p class="fail"> Add Failed! </p>
			<h3>Result: </h3>
			<p>{errorAdd.slice(1, -1)}</p>
		{/if}
	</Route>

	<Route path="list">
		<h3><u>List Datasets</u></h3>
		<p><input type="submit" value="List Datasets" on:click={listGetDatasets}/></p>
		{#if resultList !== ""}
		<p class="success"> List of Datasets: </p>
		<h3>Result: </h3>
		<p class="resultListWidth">{resultList}</p>
		{/if}
	</Route>

	<Route path="delete">
		<h3><u>Delete a Dataset</u></h3>
		<p>Dataset Name : <input type="text" id="deleteDatasetId" bind:value={deleteDatasetId}/></p>
		<input type="submit" name="deleteDataset" value="Delete Dataset" on:click={deleteDeleteRequest}/>
		{#if errorDelete == null}
			<p class="success"> Delete Success! </p>
			<h3>Result: </h3>
			<p>Dataset deleted: {resultDelete}</p>
		{/if}
		{#if resultDelete == null}
			<p class="fail"> Delete Failed! </p>
			<h3>Result: </h3>
			<p>{errorDelete.slice(1, -1)}</p>
		{/if}
	</Route>

	<Route>
		<h3><u>Query a Dataset</u></h3>
		<table>
			<tr>
				<td><h2>Input Query:</h2></td>
				<td><h2>Result:</h2></td>
			</tr>
			<tr>
				<td>
					<p><textarea rows="20" name="query" cols="50" bind:value={query}></textarea></p>
					<button on:click={queryPostRequest}>Query Dataset</button>
				</td>
				<td>
					{#if errorQuery == null}
						<!--table: https://svelte.dev/repl/9d1bc0a8af79459f8ad0cd6c9cb82fa2?version=3.29.4-->
						<!--https://stackoverflow.com/questions/8232713/how-to-display-scroll-bar-onto-a-html-table-->
						<!--https://stackoverflow.com/questions/65050679/javascript-a-simple-way-to-save-a-text-file-->
						<!--remove these two divs to remove the scrolling-->
						<div id="table-wrapper">
							<div id="table-scroll">
								<table>
									<thead>
									<tr>
										{#each Object.keys(queryResultsSeparated[0]) as header}
											<th>{header}</th>
										{/each}
									</tr>
									</thead>
									<tbody>
									{#each queryResultsSeparated as row}
										<tr>
											{#each Object.values(row) as value}
												<td>{value}</td>
											{/each}
										</tr>
									{/each}
									</tbody>
								</table>
							</div>
						</div>
						<button on:click={download} class="downloadButton">Download Results (.json)</button>
					{/if}
					{#if resultQuery == null}
						<p class="fail"> Query Failed! </p>
						<h3>Result: </h3>
						<p>{errorQuery.slice(1, -1)}</p>
					{/if}
				</td>
			</tr>
		</table>
	</Route>
</Router>
