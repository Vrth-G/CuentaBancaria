using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace CuentaBancaria.Clases
{
    public class Cuenta
    {
        //campos estaticos
        public static int ContadorDeCuentas = 0;
        public static double TotalDinero;

        //atributos
        private int _NumeroDeCuenta;
        private string _TitularDeCuenta;
        private double _Saldo;
        private bool _Estado;

        //metodos setter y getter
        public bool Estado
        {
            get { return _Estado; }
            set { _Estado = value; }
        }


        public double Saldo
        {
            get { return _Saldo; }
            set { _Saldo = value; }
        }

        public string TitularDeCuenta
        {
            get { return _TitularDeCuenta; }
            set { _TitularDeCuenta = value; }
        }

        public int NumeroDeCuenta
        {
            get { return _NumeroDeCuenta; }
            set { _NumeroDeCuenta = value; }
        }
        // constructor por defecto 
        public Cuenta()
        {
            
        }
        public Cuenta(int numeroDeCuenta, string titularDeCuenta, double saldo, bool estado)
        {
            _NumeroDeCuenta = numeroDeCuenta;
            _TitularDeCuenta = titularDeCuenta;
            _Saldo = saldo;
            _Estado = estado;
            ContadorDeCuentas++;
            TotalDinero += saldo;
        }      
        public bool Depositar()
        {
            if (_NumeroDeCuenta != 0)
            {
                Saldo += Saldo;
                return true;
            }
            return false;


        }
        public void MostrarCuenta(int NumCuenta)
        {
            if (NumeroDeCuenta==NumCuenta)
            {
                Console.WriteLine("Numero de cuenta: " + NumeroDeCuenta);
                Console.WriteLine("Titular de la cuenta: " + TitularDeCuenta);
                Console.WriteLine("Estado: " + Estado);
                Console.WriteLine("Saldo: " + Saldo);
            }
            
        }

    }
}
