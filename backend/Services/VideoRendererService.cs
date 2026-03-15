using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Drawing.Processing;
using SixLabors.Fonts;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace SpinTrackerBackend.Services;

public class VideoRendererService
{
    private readonly ILogger<VideoRendererService> _logger;
    private readonly string _tempDirectory;
    private readonly string? _ffmpegPath;

    public VideoRendererService(ILogger<VideoRendererService> logger)
    {
        _logger = logger;
        _tempDirectory = Path.Combine(Path.GetTempPath(), "SpinTracker_Video_" + DateTime.Now.Ticks);
        Directory.CreateDirectory(_tempDirectory);
        
        _ffmpegPath = FindFfmpeg();
        _logger.LogInformation("VideoRendererService initialized. Temp dir: {TempDir}, FFmpeg: {FfmpegPath}", 
            _tempDirectory, _ffmpegPath ?? "not found");
    }

    private string? FindFfmpeg()
    {
        var possiblePaths = new[]
        {
            "ffmpeg",
            "ffmpeg.exe",
            @"C:\ffmpeg\bin\ffmpeg.exe",
            @"/usr/bin/ffmpeg",
            @"/usr/local/bin/ffmpeg"
        };

        foreach (var path in possiblePaths)
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = path,
                        Arguments = "-version",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                process.Start();
                process.WaitForExit(2000);
                if (process.ExitCode == 0)
                {
                    return path;
                }
            }
            catch
            {
                // Continue to next path
            }
        }
        return null;
    }

    public class FrameData
    {
        public int Index { get; set; }
        public string? PlayerName { get; set; }
        public double PlayerStack { get; set; }
        public double PlayerBet { get; set; }
        public string? ActionLabel { get; set; }
        public string? ActionType { get; set; }
        public List<PlayerState> Players { get; set; } = new();
        public List<string> CommunityCards { get; set; } = new();
        public double Pot { get; set; }
        public int DealerSeat { get; set; }
        public string? StreetName { get; set; }
    }

    public class PlayerState
    {
        public string Name { get; set; } = "";
        public int Seat { get; set; }
        public double Stack { get; set; }
        public double CurrentBet { get; set; }
        public string Cards { get; set; } = "";
        public bool IsHero { get; set; }
        public bool IsFolded { get; set; }
        public bool IsWinner { get; set; }
        public string? ActionLabel { get; set; }
        public string? ActionType { get; set; }
    }

    public async Task<VideoRenderResult> RenderVideoAsync(VideoRenderRequest request)
    {
        var result = new VideoRenderResult();
        
        try
        {
            _logger.LogInformation("Starting video render for {FrameCount} frames", request.Frames.Count);
            
            // Generate PNG frames
            var framePaths = new List<string>();
            for (int i = 0; i < request.Frames.Count; i++)
            {
                var framePath = Path.Combine(_tempDirectory, $"frame_{i:D5}.png");
                await RenderFrameAsync(request.Frames[i], framePath, request.Width, request.Height);
                framePaths.Add(framePath);
                
                if (i % 10 == 0)
                {
                    _logger.LogInformation("Rendered {Current}/{Total} frames", i + 1, request.Frames.Count);
                }
            }

            // Encode video with ffmpeg
            if (_ffmpegPath == null)
            {
                result.Success = false;
                result.Error = "FFmpeg not found. Please install FFmpeg to enable video export.";
                return result;
            }

            var outputPath = request.OutputPath ?? Path.Combine(_tempDirectory, "output.mp4");
            
            var ffmpegArgs = $"-framerate {request.FrameRate} -i \"{Path.Combine(_tempDirectory, "frame_%05d.png")}\" " +
                           $"-c:v libx264 -pix_fmt yuv420p -vf \"scale=trunc(iw/2)*2:trunc(ih/2)*2\" " +
                           $"-y \"{outputPath}\"";

            _logger.LogInformation("Running ffmpeg with args: {Args}", ffmpegArgs);
            
            var ffmpegProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = _ffmpegPath,
                    Arguments = ffmpegArgs,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = _tempDirectory
                }
            };

            ffmpegProcess.Start();
            var stderr = await ffmpegProcess.StandardError.ReadToEndAsync();
            await ffmpegProcess.WaitForExitAsync();

            if (ffmpegProcess.ExitCode != 0)
            {
                _logger.LogError("FFmpeg failed: {Error}", stderr);
                result.Success = false;
                result.Error = $"FFmpeg encoding failed: {stderr}";
                return result;
            }

            // Read the generated video
            if (File.Exists(outputPath))
            {
                result.VideoData = await File.ReadAllBytesAsync(outputPath);
                result.OutputPath = outputPath;
                result.Success = true;
                _logger.LogInformation("Video rendered successfully: {Size} bytes", result.VideoData.Length);
            }
            else
            {
                result.Success = false;
                result.Error = "Video file was not created";
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Video render failed");
            result.Success = false;
            result.Error = ex.Message;
        }
        finally
        {
            // Cleanup temp directory
            try
            {
                if (Directory.Exists(_tempDirectory))
                {
                    Directory.Delete(_tempDirectory, true);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to cleanup temp directory");
            }
        }

        return result;
    }

    private async Task RenderFrameAsync(FrameData frame, string outputPath, int width, int height)
    {
        await Task.Run(() =>
        {
            using var image = new Image<Rgba32>(width, height);
            
            // Background - felt green
            image.Mutate(ctx => ctx.Fill(Color.FromRgb(0x0D, 0x6B, 0x45)));
            
            // Draw table (rounded rectangle approximation)
            var tableWidth = width * 4 / 5;
            var tableHeight = height * 3 / 5;
            var centerX = width / 2;
            var centerY = height / 2;
            var tableLeft = centerX - tableWidth / 2;
            var tableTop = centerY - tableHeight / 2;
            
            // Table felt
            image.Mutate(ctx => ctx.Fill(Color.FromRgb(0x0A, 0x54, 0x36), new Rectangle(tableLeft, tableTop, tableWidth, tableHeight)));

            // Community cards in center
            if (frame.CommunityCards.Count > 0)
            {
                var cardStartX = width / 2 - (frame.CommunityCards.Count * 40) / 2;
                var cardY = height / 2 - 25;
                
                for (int i = 0; i < frame.CommunityCards.Count; i++)
                {
                    DrawCard(image, frame.CommunityCards[i], cardStartX + i * 40, cardY);
                }
            }

            // Draw pot
            if (frame.Pot > 0)
            {
                var potText = $"Pot: {frame.Pot:F0}";
                var font = SystemFonts.Get("Arial").CreateFont(16, SixLabors.Fonts.FontStyle.Bold);
                image.Mutate(ctx => ctx.DrawText(potText, font, Color.White, new PointF(width / 2 - 30, height / 2 + 60)));
            }

            // Draw street name
            if (!string.IsNullOrEmpty(frame.StreetName))
            {
                var font = SystemFonts.Get("Arial").CreateFont(14, SixLabors.Fonts.FontStyle.Regular);
                image.Mutate(ctx => ctx.DrawText(frame.StreetName, font, Color.FromRgb(0x90, 0xEE, 0x90), new PointF(width / 2 - 30, height / 2 + 90)));
            }

            // Draw players
            var positions = GetSeatPositions(frame.Players.Count, width, height);
            for (int i = 0; i < frame.Players.Count; i++)
            {
                var player = frame.Players[i];
                var pos = positions[i];
                DrawPlayer(image, player, pos.X, pos.Y, width, height);
            }
            
            image.Save(outputPath);
        });
    }

    private PointF[] GetSeatPositions(int playerCount, int width, int height)
    {
        var positions = new List<PointF>();
        var centerX = width / 2;
        var centerY = height / 2;
        var radiusX = width * 0.35f;
        var radiusY = height * 0.35f;

        if (playerCount == 2)
        {
            positions.Add(new PointF(centerX, centerY - radiusY)); // Top
            positions.Add(new PointF(centerX, centerY + radiusY)); // Bottom
        }
        else if (playerCount == 3)
        {
            positions.Add(new PointF(centerX - radiusX * 0.7f, centerY - radiusY * 0.5f));
            positions.Add(new PointF(centerX, centerY + radiusY * 0.8f));
            positions.Add(new PointF(centerX + radiusX * 0.7f, centerY - radiusY * 0.5f));
        }
        else if (playerCount <= 6)
        {
            for (int i = 0; i < playerCount; i++)
            {
                var angle = Math.PI + (Math.PI * i / (playerCount - 1));
                positions.Add(new PointF(
                    centerX + (float)(radiusX * Math.Cos(angle)),
                    centerY + (float)(radiusY * Math.Sin(angle))
                ));
            }
        }
        else
        {
            for (int i = 0; i < playerCount; i++)
            {
                var angle = Math.PI + (Math.PI * 2 * i / playerCount);
                positions.Add(new PointF(
                    centerX + (float)(radiusX * Math.Cos(angle)),
                    centerY + (float)(radiusY * Math.Sin(angle))
                ));
            }
        }

        return positions.ToArray();
    }

    private void DrawPlayer(Image<Rgba32> image, PlayerState player, float x, float y, int width, int height)
    {
        var font = SystemFonts.Get("Arial");
        
        // Player box background
        var boxColor = player.IsHero ? Color.FromRgb(0x1E, 0x40, 0x80) : Color.FromRgb(0x2D, 0x2D, 0x2D);
        if (player.IsWinner)
            boxColor = Color.FromRgb(0x28, 0xA0, 0x28);
        
        var boxWidth = 100;
        var boxHeight = 70;
        
        // Draw box
        image.Mutate(ctx => ctx.Fill(boxColor, new Rectangle((int)(x - boxWidth/2), (int)(y - boxHeight/2), boxWidth, boxHeight)));

        // Draw action label
        if (!string.IsNullOrEmpty(player.ActionLabel))
        {
            var actionColor = GetActionColor(player.ActionType);
            var boldFont = font.CreateFont(12, SixLabors.Fonts.FontStyle.Bold);
            image.Mutate(ctx => ctx.Fill(actionColor, new Rectangle((int)(x - boxWidth/2), (int)(y - boxHeight/2 - 20), boxWidth, 20)));
            image.Mutate(ctx => ctx.DrawText(player.ActionLabel, boldFont, Color.White, new PointF(x - boxWidth/2 + 5, y - boxHeight/2 - 17)));
        }

        // Player name
        var displayName = player.Name.Length > 10 ? player.Name.Substring(0, 10) : player.Name;
        var boldFont2 = font.CreateFont(12, SixLabors.Fonts.FontStyle.Bold);
        image.Mutate(ctx => ctx.DrawText(displayName, boldFont2, Color.White, new PointF(x - boxWidth/2 + 5, y - boxHeight/2 + 5)));

        // Stack
        var normalFont = font.CreateFont(11, SixLabors.Fonts.FontStyle.Regular);
        image.Mutate(ctx => ctx.DrawText($"${player.Stack:F0}", normalFont, Color.FromRgb(0xFF, 0xD7, 0x00), new PointF(x - boxWidth/2 + 5, y - boxHeight/2 + 22)));

        // Cards
        if (!player.IsFolded && !string.IsNullOrEmpty(player.Cards))
        {
            var cards = ParseCards(player.Cards);
            var cardX = x - boxWidth/2 + 5;
            var cardY = y + 5;
            foreach (var card in cards)
            {
                DrawCard(image, card, (int)cardX, (int)cardY, 30, 42);
                cardX += 32;
            }
        }

        // Current bet
        if (player.CurrentBet > 0)
        {
            image.Mutate(ctx => ctx.Fill(Color.FromRgb(0x40, 0x40, 0x40), new Rectangle((int)(x + boxWidth/2 + 5), (int)(y - 15), 50, 20)));
            image.Mutate(ctx => ctx.DrawText($"${player.CurrentBet:F0}", normalFont, Color.White, new PointF(x + boxWidth/2 + 10, y - 10)));
        }
    }

    private void DrawCard(Image<Rgba32> image, string card, int x, int y, int width = 30, int height = 42)
    {
        var cardColor = GetCardColor(card);
        
        // Card background
        image.Mutate(ctx => ctx.Fill(Color.White, new Rectangle(x, y, width, height)));
        
        if (string.IsNullOrEmpty(card) || card.Length < 2) return;
        
        var rank = card[0].ToString();
        var suit = card[1].ToString();
        
        var font = SystemFonts.Get("Arial");
        var suitSymbol = GetSuitSymbol(suit);
        
        // Rank
        var boldFont = font.CreateFont(12, SixLabors.Fonts.FontStyle.Bold);
        image.Mutate(ctx => ctx.DrawText(rank, boldFont, cardColor, new PointF(x + 3, y + 2)));
        
        // Suit
        var bigFont = font.CreateFont(14, SixLabors.Fonts.FontStyle.Bold);
        image.Mutate(ctx => ctx.DrawText(suitSymbol, bigFont, cardColor, new PointF(x + width/2 - 5, y + height/2 - 8)));
    }

    private Color GetCardColor(string card)
    {
        if (string.IsNullOrEmpty(card) || card.Length < 2) return Color.Black;
        var suit = card[1].ToString();
        return (suit == "h" || suit == "d") ? Color.Red : Color.Black;
    }

    private string GetSuitSymbol(string suit)
    {
        return suit.ToLower() switch
        {
            "h" => "♥",
            "d" => "♦",
            "c" => "♣",
            "s" => "♠",
            _ => ""
        };
    }

    private List<string> ParseCards(string cardsStr)
    {
        var cards = new List<string>();
        if (string.IsNullOrEmpty(cardsStr)) return cards;
        
        var matches = Regex.Matches(cardsStr, @"[2-9TJQKA][shdc]");
        foreach (Match match in matches)
        {
            cards.Add(match.Value.ToLower());
        }
        return cards;
    }

    private Color GetActionColor(string? actionType)
    {
        return actionType?.ToLower() switch
        {
            "fold" => Color.FromRgb(0x4A, 0x4A, 0x4A),
            "check" => Color.FromRgb(0x16, 0xA0, 0x85),
            "call" => Color.FromRgb(0x25, 0x75, 0xCA),
            "bet" => Color.FromRgb(0xEA, 0xA5, 0x00),
            "raise" => Color.FromRgb(0xDC, 0x26, 0x26),
            "all-in" => Color.FromRgb(0x8B, 0x5C, 0xF6),
            "win" => Color.FromRgb(0xE8, 0xA8, 0x00),
            _ => Color.FromRgb(0x4A, 0x4A, 0x4A)
        };
    }
}

public class VideoRenderRequest
{
    public List<VideoRendererService.FrameData> Frames { get; set; } = new();
    public int Width { get; set; } = 1280;
    public int Height { get; set; } = 720;
    public int FrameRate { get; set; } = 2;
    public string? OutputPath { get; set; }
}

public class VideoRenderResult
{
    public bool Success { get; set; }
    public byte[]? VideoData { get; set; }
    public string? OutputPath { get; set; }
    public string? Error { get; set; }
}
