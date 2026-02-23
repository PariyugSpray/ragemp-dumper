class ResourceType {
    constructor(name) {
        this.name = name;
        this.files = [];
    }

    addFile(file) {
        this.files.push(file);
    }
}

const fs = require('fs');
const path = require('path');

function scanDirectory(directory) {
    let resources = [];
    fs.readdirSync(directory).forEach(file => {
        const fullPath = path.join(directory, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            const subResources = scanDirectory(fullPath);
            resources = resources.concat(subResources);
        } else {
            const resourceType = new ResourceType(path.extname(file));
            resourceType.addFile(fullPath);
            resources.push(resourceType);
        }
    });
    return resources;
}

function copyFiles(files, destination) {
    files.forEach(file => {
        const dest = path.join(destination, path.basename(file));
        fs.copyFileSync(file, dest);
        console.log(`Copied ${file} to ${dest}`);
    });
}

function extractMetadata(file) {
    // Example: Replace this with actual metadata extraction logic
    return { file, created: new Date(), size: fs.statSync(file).size };
}

function reportResources(resources) {
    resources.forEach(resourceType => {
        console.log(`Resource Type: ${resourceType.name}`);
        console.log(`Files: ${resourceType.files.length}`);
        resourceType.files.forEach(file => {
            const metadata = extractMetadata(file);
            console.log(`- ${file}: ${JSON.stringify(metadata)}`);
        });
    });
}

// Main logic
const mainDirectory = 'your-directory-path'; // Change this to your directory path
const resources = scanDirectory(mainDirectory);
reportResources(resources);
