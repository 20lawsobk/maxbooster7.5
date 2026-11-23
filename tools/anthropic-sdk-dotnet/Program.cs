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
        var standardInput = Console.OpenStandardInput();
        var readBuffer = new byte[81920];
        while (true)
        {
            var bytesRead = await standardInput.ReadAsync(readBuffer.AsMemory());
            if (bytesRead == 0)
            {
                break;
            }
            if (input.Length + bytesRead > RequestLimitBytes)
            {
                Console.Error.WriteLine("Claude SDK request exceeds the 24 MiB limit");
                return 2;
            }
            input.Write(readBuffer, 0, bytesRead);
        }

        using var requestDocument = JsonDocument.Parse(input.ToArray());
        if (requestDocument.RootElement.ValueKind != JsonValueKind.Object)
        {
            Console.Error.WriteLine("Claude SDK request must be a JSON object");
            return 2;
        }

        var requestFields = requestDocument.RootElement
            .EnumerateObject()
            .ToDictionary(field => field.Name, field => field.Value.Clone());
        var parameters = MessageCreateParams.FromRawUnchecked(
            new Dictionary<string, JsonElement>(),
            new Dictionary<string, JsonElement>(),
            requestFields);

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
    catch (JsonException error)
    {
        // JsonException.Path identifies the failing field without echoing the
        // request body, which may contain private prompts or user data.
        Console.Error.WriteLine(
            $"Claude SDK request is invalid JSON or has an unsupported message shape at {error.Path ?? "root"}");
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
