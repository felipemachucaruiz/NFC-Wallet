export default function Returns() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">Política de Devoluciones</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Reglamento de Compensación al Consumidor y Régimen de Devoluciones — TAPEE
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">Sección 1: Fundamentos Legales del Consumidor Digital</h2>
          <p className="text-muted-foreground leading-relaxed">
            Este reglamento opera bajo los principios de la Ley 1480 de 2011 (Estatuto del Consumidor) y el Decreto 587 de 2016 relativo a la reversión de pagos en comercio electrónico. El Usuario reconoce que la compra de boletería es un contrato de prestación de servicios de esparcimiento con fecha y hora determinada.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">Sección 2: Excepción Legal al Derecho de Retracto</h2>
          <p className="text-muted-foreground leading-relaxed">
            De conformidad con el Artículo 47, Numeral 12 de la Ley 1480 de 2011, el derecho de retracto no es aplicable a los servicios de adquisición de entradas para espectáculos públicos. Una vez realizada la compra, no habrá lugar a devoluciones por el simple cambio de opinión del Usuario, imposibilidad de viaje, compromisos laborales sobrevinientes o errores en la selección de la boleta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">Sección 3: Protocolo ante Cancelación o Modificación del Evento</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><span className="font-medium text-foreground">Cancelación Definitiva:</span> Si el evento es cancelado sin nueva fecha programada por causas imputables al Organizador, el Organizador es el único responsable de la devolución del 100% del valor facial de la entrada.</li>
            <li><span className="font-medium text-foreground">Rol de TAPEE:</span> En su calidad de intermediario, TAPEE gestionará la devolución de los fondos previa entrega de estos por parte del Organizador. Si el Organizador no transfiere los fondos a TAPEE, el Usuario deberá dirigir su reclamación directamente contra el patrimonio del Organizador.</li>
            <li><span className="font-medium text-foreground">Modificaciones Sustanciales:</span> Se entiende por modificación sustancial el cambio del artista principal (en conciertos no festival), cambio de fecha o traslado de lugar a una ciudad diferente. En estos casos, el Usuario tendrá un plazo de cinco (5) días hábiles desde la comunicación oficial para solicitar el reembolso. Vencido este plazo sin comunicación del Usuario, se entenderá aceptada la modificación.</li>
            <li><span className="font-medium text-foreground">No Devolución de Cargos por Servicio:</span> Dado que TAPEE ha prestado el servicio de intermediación, emisión de ticket y reserva de cupo, el Cargo por Servicio (Service Fee) no será reembolsable, salvo que la ley colombiana obligue expresamente a ello en circunstancias de fallo tecnológico propio de la plataforma.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">Sección 4: Procedimiento para la Reversión de Pagos</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Bajo el Decreto 587 de 2016, el Usuario tiene derecho a solicitar la reversión de su pago ante TAPEE y su entidad bancaria únicamente cuando:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Haya sido víctima de un fraude electrónico.</li>
            <li>Corresponda a una operación no solicitada.</li>
            <li>El producto/servicio no sea recibido (en este caso, que el evento se cancele y no haya respuesta del Organizador).</li>
            <li>Haya un error involuntario en el monto debitado.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-3">
            <span className="font-medium text-foreground">Plazo:</span> El Usuario debe presentar la queja dentro de los cinco (5) días hábiles siguientes a la fecha en que tuvo conocimiento del hecho.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">Sección 5: Fuerza Mayor y Actos de Autoridad</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            No habrá lugar a reclamación por incumplimiento ni a devoluciones inmediatas en casos de Fuerza Mayor o Caso Fortuito, incluyendo pero no limitado a:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Pandemias, epidemias o crisis sanitarias que generen restricciones de movilidad o aforo por decreto gubernamental.</li>
            <li>Desastres naturales (terremotos, inundaciones masivas).</li>
            <li>Actos de terrorismo, asonadas, paros nacionales o alteraciones graves del orden público.</li>
            <li>Duelo nacional o muerte de jefes de estado.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-3">
            En estos casos, se seguirán las directrices que el Gobierno Nacional dicte sobre la reprogramación de espectáculos públicos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3 text-primary">Sección 6: Canales de Reclamación (PQR)</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Para cualquier solicitud de reembolso autorizada, el Usuario deberá radicar un correo a{" "}
            <a href="mailto:hola@tapee.app" className="text-primary hover:underline">hola@tapee.app</a>{" "}
            adjuntando:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Copia del documento de identidad.</li>
            <li>Certificación bancaria (para transferencias).</li>
            <li>Soporte de compra (Ticket / Código de referencia).</li>
          </ul>
        </section>

      </div>
    </div>
  );
}
