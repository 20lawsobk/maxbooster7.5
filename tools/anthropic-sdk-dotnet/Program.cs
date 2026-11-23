using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

const int RequestLimitBytes = 24 * 1024 * 1024;
const int TimeoutSeconds = 300;

static async Task<int> MainAsync()
{
    var apiKey = Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
    if (string.IsNullOrWhiteSpace(apiKey))
    {
        Console.Error.WriteLine("ANTHROPIC_API_KEY is not set");
        return 2;
    }

    try
    {
        using var input = new MemoryStream();
        await Console.OpenStandardInput().CopyToAsync(input);
        if (input.Length > RequestLimitBytes)
        {
            Console.Error.WriteLine("Claude SDK request exceeds the 24 MiB limit");
            return 2;
        }

        var requestJson = System.Text.Encoding.UTF8.GetString(input.ToArray());
        var parameters = JsonSerializer.Deserialize<MessageCreateParams>(requestJson);
        if (parameters is null)
        {
            Console.Error.WriteLine("Claude SDK request must be a JSON object");
            return 2;
        }

        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(TimeoutSeconds));
        var client = new AnthropicClient
        {
            ApiKey = apiKey,
            MaxRetries = 4,
            Timeout = TimeSpan.FromSeconds(TimeoutSeconds),
            BaseUrl = Environment.GetEnvironmentVariable("ANTHROPIC_BASE_URL")
                ?? "https://api.anthropic.com",
        };
        var response = await client.Messages.Create(parameters, cancellation.Token);
        Console.Out.WriteLine(JsonSerializer.Serialize(response));
        return 0;
    }
    catch (JsonException)
    {
        Console.Error.WriteLine("Claude SDK request is invalid JSON or has an unsupported message shape");
        return 2;
    }
    catch (OperationCanceledException)
    {
        Console.Error.WriteLine("Anthropic .NET SDK request timed out");
        return 1;
    }
    catch (Exception error)
    {
        // SDK exceptions may contain request or provider response details. Keep
        // the cross-runtime protocol error-only and never echo those messages.
        Console.Error.WriteLine($"Anthropic .NET SDK request failed ({error.GetType().Name})");
        return 1;
    }
}

return await MainAsync();
