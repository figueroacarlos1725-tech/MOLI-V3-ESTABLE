param([string]$BaseUrl = 'http://95.111.238.35:8083/api')
$ErrorActionPreference = 'Stop'
$run = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$password = "Qa-$run-x!"
$testLat = -38 + (($run % 5000) / 10000.0)
$testLng = -70 + (($run % 4000) / 10000.0)

function Call($method, $path, $token = $null, $body = $null) {
  $headers = @{}
  if ($token) { $headers.Authorization = "Bearer $token" }
  $args = @{ Method = $method; Uri = "$BaseUrl$path"; Headers = $headers; ContentType = 'application/json' }
  if ($null -ne $body) { $args.Body = ($body | ConvertTo-Json -Depth 12) }
  Invoke-RestMethod @args
}

function Register($kind, $name) {
  Call POST '/auth/register' $null @{
    email = "qa.$kind.$run@moli.example.com"; name = $name; phone = "+5493834$run";
    password = $password; user_type = $(if ($kind -eq 'client') { 'rider' } else { 'driver' });
    is_professional = ($kind -eq 'provider')
  }
}

$client = Register client 'Cliente QA Flujo'
$provider = Register provider 'Profesional QA Flujo'
$clientToken = $client.access_token
$providerToken = $provider.access_token

Call PUT '/jobs/professional/profile' $providerToken @{
  name = 'Profesional QA Flujo'; categories = @('electricista', 'tramites');
  accepted_services = @('rides', 'deliveries', 'paperwork', 'jobs'); work_radius_km = 20; is_available = $true
} | Out-Null

function Complete-Job($category, $budget, $title) {
  $created = Call POST '/jobs/post' $clientToken @{
    category = $category; title = $title; description = 'Prueba integral automatizada de Moli QA'; budget = $budget;
    address = 'Dirección privada QA'; location = @{ latitude = -28.4696; longitude = -65.7852 }
  }
  $jobId = $created.job.job_id
  $listed = Call GET '/jobs/posts?status=open' $providerToken
  if (-not ($listed.jobs.job_id -contains $jobId)) { throw "$category no apareció para el profesional" }
  $detailBefore = Call GET "/jobs/detail/$jobId" $providerToken
  if ($detailBefore.job.address) { throw "$category expuso la dirección antes de revisión/asignación" }
  Call POST "/jobs/$jobId/review" $providerToken @{} | Out-Null
  Call POST "/jobs/$jobId/accept" $providerToken @{} | Out-Null
  Call PUT "/jobs/$jobId/status" $providerToken @{ status = 'in_progress' } | Out-Null
  Call PUT "/jobs/$jobId/status" $providerToken @{ status = 'mark_completed' } | Out-Null
  Call PUT "/jobs/$jobId/status" $clientToken @{ status = 'confirm_completed' } | Out-Null
  Call POST "/jobs/$jobId/rate" $clientToken @{ rating = 5; comment = 'QA OK' } | Out-Null
  $final = Call GET "/jobs/detail/$jobId" $clientToken
  if ($final.job.status -ne 'completed') { throw "$category no terminó en completed" }
  Write-Output "PASS $category $jobId"
}

Complete-Job electricista 15000 'Revisión eléctrica QA'
Complete-Job tramites 10000 'Gestión documental QA'

Call POST '/vehicles' $providerToken @{
  make = 'Toyota'; model = 'Etios QA'; year = 2022; color = 'Naranja'; plate_number = "QA$run"; vehicle_type = 'economy'; capacity = 4
} | Out-Null
Call PUT "/drivers/availability?is_online=true&latitude=$testLat&longitude=$testLng" $providerToken | Out-Null
$ride = Call POST '/rides/request' $clientToken @{
  pickup_location = @{ latitude = $testLat; longitude = $testLng; address = 'Origen QA' };
  dropoff_location = @{ latitude = $testLat + 0.01; longitude = $testLng + 0.01; address = 'Destino QA' };
  vehicle_type = 'economy'; payment_method = 'cash'; ride_type = 'standard'
}
$requestId = $ride.request_id
$offered = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 1
  $active = Call GET '/rides/request/active' $clientToken
  if ($active.request.candidate_driver_ids -contains $provider.user.user_id) { $offered = $true; break }
}
if (-not $offered) { throw 'El viaje no llegó al conductor cercano' }
$review = Call POST "/rides/request/$requestId/review" $providerToken
if ($review.status -ne 'reviewing' -or $review.countdown -ne 35) { throw 'No se obtuvo el bloqueo exclusivo de revisión' }
$accepted = Call POST "/rides/$requestId/driver-response?action=accept" $providerToken
if ($accepted.status -ne 'accepted') { throw 'El viaje no fue aceptado' }
Call PUT "/rides/$($accepted.ride_id)/status?status=arrived" $providerToken | Out-Null
Call PUT "/rides/$($accepted.ride_id)/status?status=started" $providerToken | Out-Null
Call PUT "/rides/$($accepted.ride_id)/status?status=completed" $providerToken | Out-Null
$rideFinal = Call GET "/rides/$($accepted.ride_id)" $clientToken
if ($rideFinal.status -ne 'completed') { throw 'El viaje no terminó en completed' }
Call POST "/rides/$($accepted.ride_id)/rate?rating=5&comment=QA%20OK" $clientToken | Out-Null
Write-Output "PASS ride $requestId"
Write-Output 'ALL CORE FLOWS PASSED'
