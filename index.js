const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const ProgressBar = require('progress');
const version = '2.0.0';

program.version(version)
  .description('RAGE:MP Resource Dumper - Extract cars, bikes, clothes, DLC and all resources')
  .option('-s, --source <path>', 'Source RAGE:MP game directory')
  .option('-d, --destination <path>', 'Destination dump directory')
  .option('--cars', 'Dump car models and metadata')
  .option('--bikes', 'Dump bike models and metadata')
  .option('--clothes', 'Dump clothing items and textures')
  .option('--dlc', 'Dump all DLC content')
  .option('--all', 'Dump everything (cars, bikes, clothes, DLC)')
  .option('-v, --verbose', 'Verbose logging')
  .option('--json-meta', 'Export metadata as JSON')
  .parse(process.argv);

const options = program.opts();

class ResourceType {
  constructor(name, patterns, paths) {
    this.name = name;
    this.patterns = patterns;
    this.paths = paths;
    this.files = [];
  }
}

class RageMPResourceDumper {
  constructor(source, destination, options = {}) {
    this.source = path.resolve(source);
    this.destination = path.resolve(destination);
    this.verbose = options.verbose || false;
    this.jsonMeta = options.jsonMeta || false;
    this.resourceTypes = this.initResourceTypes();
    this.selectedResources = this.determineSelectedResources(options);
    this.stats = { totalFiles: 0, copiedFiles: 0, failedFiles: 0, resources: {} };
  }

  initResourceTypes() {
    return {
      cars: new ResourceType('Vehicles - Cars', [/\.ytd$/i, /\.yft$/i, /vehicles\.meta$/i, /carvariations\.meta$/i, /handling\.meta$/i], ['x64e.rpf/levels/gta5/vehicles.rpf']),
      bikes: new ResourceType('Vehicles - Bikes/Motorcycles', [/\.ytd$/i, /\.yft$/i, /vehicles\.meta$/i, /carvariations\.meta$/i], ['x64e.rpf/levels/gta5/vehicles.rpf']),
      clothes: new ResourceType('Clothing & Character', [/\.ytd$/i, /\.yft$/i, /clothesmetaclips\.meta$/i, /pedpersonality\.meta$/i, /pedstreaming\.meta$/i, /ped\.meta$/i], ['x64e.rpf/levels/gta5/skins.rpf', 'x64e.rpf/levels/gta5/clothes.rpf', 'common.rpf/data/cdimages']),
      dlc: new ResourceType('DLC Content', [/\.rpf$/i, /\.ytd$/i, /\.yft$/i, /\.ydr$/i, /\.yld$/i, /\.ydd$/i, /\.meta$/i], ['x64e.rpf/dlc_patch', 'x64e.rpf/dlc_postvehicles', 'x64e.rpf/dlc_patchshop', 'x64e.rpf/dlcpacks'])
    };
  }

  determineSelectedResources(opts) {
    if (opts.all) return Object.keys(this.resourceTypes);
    const selected = [];
    if (opts.cars) selected.push('cars');
    if (opts.bikes) selected.push('bikes');
    if (opts.clothes) selected.push('clothes');
    if (opts.dlc) selected.push('dlc');
    return selected.length > 0 ? selected : Object.keys(this.resourceTypes);
  }

  log(message, type = 'info') {
    if (!this.verbose && type === 'debug') return;
    const timestamp = new Date().toISOString();
    const timeStr = `[${timestamp}]`;
    switch (type) {
      case 'info': console.log(chalk.blue(`${timeStr} ℹ️  ${message}`)); break;
      case 'success': console.log(chalk.green(`${timeStr} ✅ ${message}`)); break;
      case 'error': console.log(chalk.red(`${timeStr} ❌ ${message}`)); break;
      case 'warning': console.log(chalk.yellow(`${timeStr} ⚠️  ${message}`)); break;
      case 'debug': console.log(chalk.gray(`${timeStr} 🔍 ${message}`)); break;
      case 'resource': console.log(chalk.cyan(`${timeStr} 📦 ${message}`)); break;
    }
  }

  validatePaths() {
    if (!fs.existsSync(this.source)) throw new Error(`Source directory does not exist: ${this.source}`);
    const sourceStats = fs.statSync(this.source);
    if (!sourceStats.isDirectory()) throw new Error(`Source path is not a directory: ${this.source}`);
    this.log(`Source validated: ${this.source}`, 'success');
  }

  findResourceFiles() {
    this.log('Scanning for resources...', 'info');
    for (const resourceKey of this.selectedResources) {
      const resource = this.resourceTypes[resourceKey];
      this.stats.resources[resourceKey] = { name: resource.name, files: [], totalSize: 0, count: 0 };
      this.log(`Scanning for ${resource.name}...`, 'resource');
      try {
        this.scanDirectoryForResources(this.source, resource, resourceKey);
        this.log(`Found ${this.stats.resources[resourceKey].count} files for ${resource.name}`, 'success');
      } catch (error) {
        this.log(`Error scanning for ${resource.name}: ${error.message}`, 'error');
      }
    }
  }

  scanDirectoryForResources(dir, resource, resourceKey, depth = 0) {
    const maxDepth = 10;
    if (depth > maxDepth) return;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            this.scanDirectoryForResources(filePath, resource, resourceKey, depth + 1);
          } else if (this.matchesResourcePattern(file, resource.patterns)) {
            resource.files.push(filePath);
            this.stats.resources[resourceKey].files.push(filePath);
            this.stats.resources[resourceKey].totalSize += stats.size;
            this.stats.resources[resourceKey].count++;
            this.stats.totalFiles++;
            this.log(`Found: ${file}`, 'debug');
          }
        } catch (error) {
          this.log(`Error processing file ${filePath}: ${error.message}`, 'warning');
        }
      }
    } catch (error) {
      this.log(`Error reading directory ${dir}: ${error.message}`, 'warning');
    }
  }

  matchesResourcePattern(filename, patterns) {
    return patterns.some(pattern => pattern.test(filename));
  }

  async copyResourceFiles() {
    const totalFiles = Object.values(this.stats.resources).reduce((sum, r) => sum + r.count, 0);
    const progressBar = new ProgressBar('[:bar] :current/:total :percent :etas', { complete: '=', incomplete: ' ', width: 30, total: totalFiles });
    for (const resourceKey of this.selectedResources) {
      const resource = this.resourceTypes[resourceKey];
      const resourceFiles = this.stats.resources[resourceKey].files;
      this.log(`Copying ${resource.name} files...`, 'resource');
      for (const filePath of resourceFiles) {
        try {
          const relativePath = path.relative(this.source, filePath);
          const destPath = path.join(this.destination, 'resources', resourceKey, relativePath);
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(filePath, destPath);
          this.stats.copiedFiles++;
          progressBar.tick();
          this.log(`Copied: ${relativePath}`, 'debug');
        } catch (error) {
          this.log(`Failed to copy ${filePath}: ${error.message}`, 'error');
          this.stats.failedFiles++;
        }
      }
    }
    console.log('\n');
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      source: this.source,
      destination: this.destination,
      totalFiles: this.stats.totalFiles,
      copiedFiles: this.stats.copiedFiles,
      failedFiles: this.stats.failedFiles,
      resources: this.stats.resources
    };
    const reportPath = path.join(this.destination, 'dump-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`Report saved to: ${reportPath}`, 'success');
    return report;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  displaySummary() {
    console.log(chalk.cyan('\n╔════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║   RAGE:MP Resource Dumper - Summary        ║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════╝\n'));
    for (const resourceKey of this.selectedResources) {
      const resource = this.stats.resources[resourceKey];
      const icon = this.getResourceIcon(resourceKey);
      console.log(chalk.white(`${icon} ${resource.name}`));
      console.log(chalk.gray(`   Files: ${resource.count} | Size: ${this.formatBytes(resource.totalSize)}`));
    }
    console.log(chalk.cyan('\n────────────────────────────────────────────\n'));
    console.log(chalk.white(`Total Files Copied: ${chalk.green(this.stats.copiedFiles)}`));
    console.log(chalk.white(`Failed Files: ${chalk.red(this.stats.failedFiles)}`));
    console.log(chalk.white(`Destination: ${chalk.cyan(this.destination)}\n`));
    if (this.stats.failedFiles === 0) console.log(chalk.green('✨ All resources dumped successfully!\n'));
    else console.log(chalk.yellow(`⚠️  Completed with ${this.stats.failedFiles} error(s)\n`));
  }

  getResourceIcon(resourceKey) {
    const icons = { cars: '🚗', bikes: '🏍️', clothes: '👕', dlc: '📦' };
    return icons[resourceKey] || '📁';
  }

  async run() {
    try {
      console.log(chalk.cyan.bold(`\n🎮 RAGE:MP Resource Dumper v${version}\n`));
      this.log('Initializing dumper...', 'info');
      this.validatePaths();
      this.log(`Resources to dump: ${this.selectedResources.join(', ')}`, 'info');
      this.findResourceFiles();
      await this.copyResourceFiles();
      this.generateReport();
      this.displaySummary();
      this.log('✨ Resource dump completed!', 'success');
    } catch (error) {
      this.log(`Fatal error: ${error.message}`, 'error');
      console.error(error.stack);
      process.exit(1);
    }
  }
}

if (!options.source || !options.destination) {
  console.log(chalk.red('\n❌ Error: Source and destination paths are required.\n'));
  program.help();
  process.exit(1);
}

const dumper = new RageMPResourceDumper(options.source, options.destination, { verbose: options.verbose, jsonMeta: options.jsonMeta, cars: options.cars, bikes: options.bikes, clothes: options.clothes, dlc: options.dlc, all: options.all });
dumper.run().catch(error => {
  console.error(chalk.red(`\n❌ Fatal Error: ${error.message}\n`));
  process.exit(1);
});