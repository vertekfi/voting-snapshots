const csvParser = require('csv-parser');
const fs = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

export interface CsvHeader {
  id: string;
  title: string;
}

class CsvService {
  constructor() {}

  async write(outputPath: string, headers: CsvHeader[], data: any[]) {
    try {
      const csvWriter = createCsvWriter({
        path: outputPath,
        header: headers,
      });
      await csvWriter.writeRecords(data);
    } catch (error) {
      throw error;
    }
  }

  async parseCSV(filePath: string): Promise<any[]> {
    return new Promise((res, rej) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('error', (err) => rej(err))
        .on('end', () => {
          res(results);
        });
    });
  }
}

export const csvService = new CsvService();
