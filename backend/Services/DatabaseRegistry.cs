using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace SpinTrackerBackend.Services;

public class DatabaseInfo
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; }
    public int HandsCount { get; set; }
}

public class DatabaseRegistry
{
    private readonly string _registryPath;
    private readonly ILogger<DatabaseRegistry> _logger;
    private List<DatabaseInfo> _databases = new();
    private readonly object _lock = new();

    public DatabaseRegistry(ILogger<DatabaseRegistry> logger)
    {
        _logger = logger;
        var appDataPath = GetAppDataPath();
        _registryPath = Path.Combine(appDataPath, "database_registry.json");
        Load();
    }

    private string GetAppDataPath()
    {
        var backendDir = Directory.GetCurrentDirectory();
        var projectRoot = Path.GetFullPath(Path.Combine(backendDir, ".."));
        var appDataPath = Path.Combine(projectRoot, "app_data");
        
        if (!Directory.Exists(appDataPath))
        {
            Directory.CreateDirectory(appDataPath);
        }
        
        return appDataPath;
    }

    public string GetDatabasesFolder()
    {
        var appDataPath = GetAppDataPath();
        var dbFolder = Path.Combine(appDataPath, "databases");
        
        if (!Directory.Exists(dbFolder))
        {
            Directory.CreateDirectory(dbFolder);
        }
        
        return dbFolder;
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_registryPath))
            {
                var json = File.ReadAllText(_registryPath);
                _databases = JsonSerializer.Deserialize<List<DatabaseInfo>>(json) ?? new List<DatabaseInfo>();
                _logger.LogInformation($"Loaded {_databases.Count} databases from registry");
            }
            else
            {
                // Create default database if none exists
                CreateDefaultDatabase();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error loading database registry: {ex.Message}");
            _databases = new List<DatabaseInfo>();
            CreateDefaultDatabase();
        }
    }

    private void CreateDefaultDatabase()
    {
        var dbFolder = GetDatabasesFolder();
        var defaultDb = new DatabaseInfo
        {
            Id = Guid.NewGuid().ToString(),
            Name = "Base de données principale",
            FileName = "poker_tracker.db",
            FilePath = Path.Combine(dbFolder, "poker_tracker.db"),
            CreatedAt = DateTime.UtcNow,
            LastUsedAt = DateTime.UtcNow,
            IsActive = true
        };
        
        _databases.Add(defaultDb);
        Save();
        
        // Copy old database if exists
        var projectRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));
        var oldDbPath = Path.Combine(projectRoot, "poker_tracker.db");
        if (File.Exists(oldDbPath) && !File.Exists(defaultDb.FilePath))
        {
            File.Copy(oldDbPath, defaultDb.FilePath);
            _logger.LogInformation("Migrated existing database to new location");
        }
        
        // Also check for WAL files and copy them
        if (File.Exists(oldDbPath + "-wal") && !File.Exists(defaultDb.FilePath + "-wal"))
        {
            try { File.Copy(oldDbPath + "-wal", defaultDb.FilePath + "-wal"); } catch { }
        }
        if (File.Exists(oldDbPath + "-shm") && !File.Exists(defaultDb.FilePath + "-shm"))
        {
            try { File.Copy(oldDbPath + "-shm", defaultDb.FilePath + "-shm"); } catch { }
        }
    }

    private void Save()
    {
        try
        {
            var json = JsonSerializer.Serialize(_databases, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_registryPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error saving database registry: {ex.Message}");
        }
    }

    public List<DatabaseInfo> GetAll()
    {
        lock (_lock)
        {
            return _databases.Select(d => new DatabaseInfo
            {
                Id = d.Id,
                Name = d.Name,
                FileName = d.FileName,
                FilePath = d.FilePath,
                CreatedAt = d.CreatedAt,
                LastUsedAt = d.LastUsedAt,
                IsActive = d.IsActive,
                HandsCount = d.HandsCount
            }).ToList();
        }
    }

    public DatabaseInfo? GetById(string id)
    {
        lock (_lock)
        {
            return _databases.FirstOrDefault(d => d.Id == id);
        }
    }

    public DatabaseInfo? GetActive()
    {
        lock (_lock)
        {
            return _databases.FirstOrDefault(d => d.IsActive);
        }
    }

    public DatabaseInfo? Create(string name)
    {
        lock (_lock)
        {
            var dbFolder = GetDatabasesFolder();
            var id = Guid.NewGuid().ToString();
            var fileName = $"spintracker_{id[..8]}.db";
            var filePath = Path.Combine(dbFolder, fileName);
            
            // Create empty database file
            var newDb = new DatabaseInfo
            {
                Id = id,
                Name = name,
                FileName = fileName,
                FilePath = filePath,
                CreatedAt = DateTime.UtcNow,
                LastUsedAt = DateTime.UtcNow,
                IsActive = false,
                HandsCount = 0
            };
            
            _databases.Add(newDb);
            Save();
            
            _logger.LogInformation($"Created new database: {name} ({fileName})");
            
            return newDb;
        }
    }

    public bool SetActive(string id)
    {
        lock (_lock)
        {
            var db = _databases.FirstOrDefault(d => d.Id == id);
            if (db == null) return false;
            
            foreach (var d in _databases)
            {
                d.IsActive = d.Id == id;
                if (d.IsActive)
                {
                    d.LastUsedAt = DateTime.UtcNow;
                }
            }
            
            Save();
            _logger.LogInformation($"Set active database to: {db.Name}");
            return true;
        }
    }

    public bool Delete(string id)
    {
        lock (_lock)
        {
            if (_databases.Count <= 1)
            {
                _logger.LogWarning("Cannot delete the last database");
                return false;
            }
            
            var db = _databases.FirstOrDefault(d => d.Id == id);
            if (db == null) return false;
            
            if (db.IsActive)
            {
                _logger.LogWarning("Cannot delete the active database");
                return false;
            }
            
            // Delete the file
            try
            {
                if (File.Exists(db.FilePath))
                {
                    File.Delete(db.FilePath);
                }
                // Also delete WAL files if they exist
                if (File.Exists(db.FilePath + "-wal")) File.Delete(db.FilePath + "-wal");
                if (File.Exists(db.FilePath + "-shm")) File.Delete(db.FilePath + "-shm");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error deleting database file: {ex.Message}");
            }
            
            _databases.Remove(db);
            Save();
            
            _logger.LogInformation($"Deleted database: {db.Name}");
            return true;
        }
    }

    public bool Rename(string id, string newName)
    {
        lock (_lock)
        {
            var db = _databases.FirstOrDefault(d => d.Id == id);
            if (db == null) return false;
            
            db.Name = newName;
            Save();
            
            _logger.LogInformation($"Renamed database to: {newName}");
            return true;
        }
    }

    public void UpdateHandsCount(string id, int count)
    {
        lock (_lock)
        {
            var db = _databases.FirstOrDefault(d => d.Id == id);
            if (db != null)
            {
                db.HandsCount = count;
                Save();
            }
        }
    }
}
